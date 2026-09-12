import { useEffect, useState } from "react";
import type { DatasetCoverageRecord } from "../packages/contracts";
import { api } from "./api";
import "./dataset-coverage.css";

const statusLabels: Record<DatasetCoverageRecord["status"], string> = {
  acquired: "Acquired",
  partial: "Partial coverage",
  blocked: "Source blocked",
  not_collected: "Not collected",
};

export function DatasetCoverage({ pilotId }: { pilotId: string }) {
  const [records, setRecords] = useState<DatasetCoverageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setRecords([]);
    setLoading(true);
    setError(false);
    api
      .datasets(pilotId)
      .then((next) => {
        if (!cancelled) setRecords(next);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pilotId, retry]);
  return (
    <section
      className="dataset-coverage"
      aria-labelledby="dataset-coverage-title"
      aria-busy={loading}
    >
      <h2 id="dataset-coverage-title">Dataset coverage</h2>
      <p className="subtle">
        Collection coverage describes source files and reference data. It does
        not measure personal safety.
      </p>
      {loading ? (
        <p role="status">Loading dataset coverage.</p>
      ) : error ? (
        <div role="alert">
          <p>Dataset coverage is unavailable.</p>
          <button
            className="button secondary"
            onClick={() => setRetry((value) => value + 1)}
          >
            Retry coverage
          </button>
        </div>
      ) : records.length === 0 ? (
        <p>No acquisition snapshot is available for this area.</p>
      ) : (
        <div className="dataset-records">
          {records.map((record) => (
            <details key={record.id} className="dataset-record">
              <summary>
                <span>{record.title}</span>
                <span className={`dataset-status status-${record.status}`}>
                  {statusLabels[record.status]}
                </span>
              </summary>
              <div className="dataset-details">
                {record.acquiredUnits !== null && record.unitLabel && (
                  <p>
                    <strong>
                      {record.acquiredUnits.toLocaleString("en-GB")}
                    </strong>{" "}
                    {record.unitLabel}
                  </p>
                )}
                <p>{record.geographyDescription}</p>
                {record.acquiredMonths.length > 0 && (
                  <p>
                    {record.acquiredMonths.length} acquired reporting months.
                    Latest: {record.latestMonth || "unavailable"}.
                  </p>
                )}
                {record.fetchedAt && (
                  <p className="subtle">
                    Snapshot{" "}
                    {new Date(record.fetchedAt).toLocaleString("en-GB")}
                  </p>
                )}
                {record.limitations.length > 0 && (
                  <ul>
                    {record.limitations.map((limit) => (
                      <li key={limit}>{limit}</li>
                    ))}
                  </ul>
                )}
                {record.sourceUrl.startsWith("https://") && (
                  <a href={record.sourceUrl} target="_blank" rel="noreferrer">
                    Open dataset source
                  </a>
                )}
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
