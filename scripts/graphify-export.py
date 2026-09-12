"""Build Graphify analysis from a validated Streetwise graph export.

Usage: python scripts/graphify-export.py INPUT.json OUTPUT_DIRECTORY
Install the pinned optional tool with: uv tool run --from graphifyy==0.9.58 python ...
No model, API key, remote request, or source extraction is used.
"""
import json
import sys
from pathlib import Path
from datetime import datetime, timezone
from collections import Counter

import networkx as nx
from graphify.cluster import cluster, score_all

input_path, output_path = Path(sys.argv[1]), Path(sys.argv[2])
data = json.loads(input_path.read_text())
if data.get("metadata", {}).get("formatVersion") != "streetwise-graphify/1":
    raise SystemExit("Use the validated /api/graph/export response.")
nodes, edges = data["nodes"], data["edges"]
identifiers = {node["id"] for node in nodes}
if len(nodes) > 300 or len(edges) > 400 or len(identifiers) != len(nodes):
    raise SystemExit("Graph size or unique identifier check failed.")
graph = nx.DiGraph()
for node in nodes:
    graph.add_node(node["id"], **{key: value for key, value in node.items() if key != "id"})
for edge in edges:
    if edge["source"] not in identifiers or edge["target"] not in identifiers:
        raise SystemExit("A relationship has a missing endpoint.")
    if graph.has_edge(edge["source"], edge["target"]):
        raise SystemExit("Parallel relationships must use distinct assertion nodes.")
    graph.add_edge(edge["source"], edge["target"], **edge)
if not graph:
    raise SystemExit("The graph is empty.")

# Import the domain graph directly. AST extraction would describe source code, not Camden evidence.
# Graphify's generic JSON exporter inserts numeric confidence defaults. Preserve our source metadata instead.
communities = cluster(graph)
cohesion = score_all(graph, communities)
labels = {}
for community_id, members in communities.items():
    types = Counter(graph.nodes[node]["type"] for node in members if graph.nodes[node]["type"] != "QualifiedAssertion")
    labels[community_id] = " / ".join(name for name, _ in types.most_common(2)) or "Evidence relations"
membership = {node: group for group, members in communities.items() for node in members}
for node in nodes:
    node["community"] = membership.get(node["id"])
    node["community_name"] = labels.get(node["community"], "Evidence")
data["metadata"].update({"generatedAt": datetime.now(timezone.utc).isoformat(), "engine": "graphifyy 0.9.58", "analysis": "Graph topology only. No evidence confidence or personal harm score.", "snapshot": "Offline snapshot. Download again after a correction or withdrawal."})
data["communities"] = {str(group): {"label": labels[group], "nodes": members, "cohesion": cohesion[group]} for group, members in communities.items()}
output_path.mkdir(parents=True, exist_ok=True)
(output_path / "graph.json").write_text(json.dumps(data, indent=2) + "\n")
degrees = sorted(graph.degree, key=lambda entry: (-entry[1], entry[0]))[:8]
report = ["# Camden Graphify report", "", f"Generated: {data['metadata']['generatedAt']}", "", f"Graphify analysed {len(nodes)} nodes, {len(edges)} directed links, and {len(communities)} communities.", "", "Each qualified assertion is a separate node. Parallel assertions retain their own metadata.", "Real source records and fictional exercise records retain separate labels. Private submissions and users are excluded.", "This offline snapshot does not update after download. Export again after a correction or withdrawal.", "", "## Most connected nodes", ""]
for node, degree in degrees:
    report.append(f"- {graph.nodes[node]['label']}: {degree} links.")
report.extend(["", "## Communities", "", "Cohesion describes network structure. It is not evidence reliability.", ""])
for group, members in communities.items():
    report.append(f"- {labels[group]}: {len(members)} nodes; cohesion {cohesion[group]}.")
report.extend(["", "## Questions", "", "- Which source snapshot contains each selected police record?", "- Which fictional assertions disappear after withdrawal?", "- Which source layers contain coverage metadata without detailed records?", "", "## Coverage limits", ""])
report.extend(f"- {limit}" for limit in data["metadata"]["limitations"])
report.extend(["", "## Execution", "", "Graphify cluster and score_all ran on the validated directed graph.", "No semantic extraction or model call ran. Extraction token cost: 0 input, 0 output.", "Application runtime validation precedes export. The exporter checked unique IDs, endpoints, bounds, and parallel-link preservation.", "", "The generated JSON preserves application metadata without Graphify's generic numeric confidence defaults.", ""])
(output_path / "GRAPH_REPORT.md").write_text("\n".join(report))
serialized = json.dumps(data).replace("<", "\\u003c")
html = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Camden Graphify graph</title><style>
:root{font:16px system-ui;color:#183e33;background:#f7f1e7}*{box-sizing:border-box}body{margin:0;padding:24px;min-width:320px}main{max-width:1440px;margin:auto}h1{font:700 32px Georgia}button,input,select{font:inherit;min-height:48px;max-width:100%}button{background:#183e33;color:white;border:0;border-radius:8px;padding:8px 16px;cursor:pointer}a{color:inherit}input,select{padding:8px;border:1px solid #9cae9b;background:#fffdf7;border-radius:6px}header p{max-width:75ch}.layout{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:20px}.canvas{min-width:0;overflow:auto;background:#fffdf7;border:1px solid #c6cdbd;border-radius:12px}svg{width:100%;min-width:560px;display:block}.detail{min-width:0;background:#eff0e3;padding:16px;border-radius:12px;overflow-wrap:anywhere;max-height:850px;overflow:auto}.controls{display:flex;flex-wrap:wrap;gap:10px;margin:20px 0}.controls label{min-width:0;max-width:100%;display:grid;gap:6px;flex:1 1 240px}.controls select,.controls input{width:100%;min-width:0}.node{cursor:pointer}.node:focus{outline:none}.node:focus circle,.node:hover circle{stroke:#132d24;stroke-width:4}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px}li{margin:8px 0}button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #e98946;outline-offset:3px}@media(max-width:700px){body{padding:16px}.layout{grid-template-columns:minmax(0,1fr)}.detail{max-height:none}h1{font-size:27px}}</style><main><header><h1>Camden Graphify graph</h1><p id="summary"></p><p>Source records and fictional accounts remain separate. Links describe source statements and shared context, never a confirmed incident match.</p><p>Offline snapshot. Download again after a correction or withdrawal.</p></header><div class="controls"><label>Find a node <input id="search" type="search"></label><label>Node <select id="select"></select></label><button id="reset">Show all links</button><a href="graph.json" download>Download graph JSON</a></div><div class="layout"><div class="canvas"><svg id="network" viewBox="0 0 1000 1000" aria-label="Camden evidence nodes and directed links" role="img"></svg></div><section class="detail" aria-live="polite"><h2 id="title">Select a node</h2><p id="type"></p><ul id="relations"></ul><pre id="metadata"></pre></section></div></main><script type="application/json" id="data">__DATA__</script><script>
const data=JSON.parse(document.getElementById('data').textContent),svg=document.getElementById('network'),select=document.getElementById('select'),ns='http://www.w3.org/2000/svg';
document.getElementById('summary').textContent=`${data.nodes.length} nodes · ${data.edges.length} directed links · ${Object.keys(data.communities).length} communities · Graphify 0.9.58`;
const sorted=[...data.nodes].sort((a,b)=>a.label.localeCompare(b.label));for(const n of sorted){const o=document.createElement('option');o.value=n.id;o.textContent=n.label+' · '+n.type;select.append(o)}
const pos=new Map(data.nodes.map((n,i)=>{const a=2*Math.PI*i/data.nodes.length;const r=n.type==='QualifiedAssertion'?330:445;return[n.id,{x:500+r*Math.cos(a),y:500+r*Math.sin(a)}]}));
function el(tag,attrs){const e=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);return e}
function draw(selected){svg.replaceChildren();const defs=el('defs',{}),marker=el('marker',{id:'arrow',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:5,markerHeight:5,orient:'auto-start-reverse'});marker.append(el('path',{d:'M0 0L10 5L0 10Z',fill:'#738579'}));defs.append(marker);svg.append(defs);
const related=new Set([selected]);for(const e of data.edges)if(e.source===selected||e.target===selected){related.add(e.source);related.add(e.target)}
for(const e of data.edges){const a=pos.get(e.source),b=pos.get(e.target),active=!selected||e.source===selected||e.target===selected;svg.append(el('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:active?'#607c69':'#e4e8dc','stroke-width':active?1.5:.5,'marker-end':'url(#arrow)'}))}
for(const n of data.nodes){const p=pos.get(n.id),g=el('g',{class:'node',tabindex:0,role:'button','aria-label':n.label,transform:`translate(${p.x},${p.y})`,opacity:!selected||related.has(n.id)?1:.25});g.append(el('circle',{r:n.type==='QualifiedAssertion'?6:12,fill:n.metadata.synthetic?'#df864f':'#2c6f52',stroke:'#fffdf7','stroke-width':2}));const t=el('title',{});t.textContent=n.label;g.append(t);if(n.type!=='QualifiedAssertion'){const label=el('text',{y:p.y<500?-18:28,'text-anchor':'middle','font-size':9,fill:'#183e33'});label.textContent=n.label.length>23?n.label.slice(0,22)+'…':n.label;g.append(label)}g.onclick=()=>show(n.id);g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();show(n.id)}};svg.append(g)}}
function show(id){const n=data.nodes.find(n=>n.id===id);if(!n)return;select.value=id;document.getElementById('title').textContent=n.label;document.getElementById('type').textContent=n.type+' · '+(n.metadata.synthetic?'Fictional exercise':'Source record or context');document.getElementById('metadata').textContent=JSON.stringify(n.metadata,null,2);const list=document.getElementById('relations');list.replaceChildren();for(const e of data.edges.filter(e=>e.source===id||e.target===id)){const other=data.nodes.find(n=>n.id===(e.source===id?e.target:e.source));const li=document.createElement('li'),b=document.createElement('button');b.textContent=e.relation+' · '+other.label;b.onclick=()=>show(other.id);li.append(b);list.append(li)}draw(id)}
select.onchange=()=>show(select.value);document.getElementById('search').oninput=e=>{const q=e.target.value.toLowerCase();const n=sorted.find(n=>n.label.toLowerCase().includes(q)||n.id.toLowerCase().includes(q));if(n)show(n.id)};document.getElementById('reset').onclick=()=>draw(null);draw(null);
</script></html>'''
(output_path / "graph.html").write_text(html.replace("__DATA__", serialized))
print(json.dumps({"nodes": len(nodes), "directedLinks": len(edges), "communities": len(communities), "output": str(output_path.resolve()), "extractionTokens": 0}))
