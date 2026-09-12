import { useState, type FormEvent } from "react";
import type { Report } from "../packages/contracts";
import { api, ApiError } from "./api";

export function ReportEditor({
  report,
  onSaved,
}: {
  report: Report;
  onSaved: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState("");
  const date = new Date(report.observedAt);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || saved || conflict) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      await api.editReport(report.id, report.revision, {
        category: String(form.get("category")) as Report["category"],
        title: String(form.get("title")),
        description: String(form.get("description")),
        place: String(form.get("place")),
        observedAt: new Date(String(form.get("observedAt"))).toISOString(),
        synthetic: true,
      });
      setSaved(true);
      try {
        await onSaved();
      } catch {
        setError(
          "Your changes were saved. Close this form and refresh My reports.",
        );
      }
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409) {
        setConflict(true);
        setError(
          "This report changed or can no longer be edited. Your draft remains below. Copy any changes, then close and refresh My reports.",
        );
      } else {
        setError(
          failure instanceof ApiError
            ? failure.message
            : "Could not save your changes. Try again.",
        );
      }
    } finally {
      setSaving(false);
    }
  }
  return (
    <form className="form-grid" onSubmit={submit}>
      <p className="synthetic">
        Fictional report. Changes stay private until review.
      </p>
      <label>
        Category
        <select
          name="category"
          defaultValue={report.category}
          disabled={saving || saved}
        >
          <option value="infrastructure">Infrastructure</option>
          <option value="transport">Transport</option>
          <option value="access">Access</option>
          <option value="community">Community observation</option>
        </select>
      </label>
      <label>
        Short title
        <input
          name="title"
          defaultValue={report.title}
          minLength={5}
          maxLength={100}
          required
          readOnly={saving || saved}
        />
      </label>
      <label>
        Approximate place
        <input
          name="place"
          defaultValue={report.place}
          minLength={3}
          maxLength={100}
          required
          readOnly={saving || saved}
        />
      </label>
      <label>
        When you observed it
        <input
          name="observedAt"
          type="datetime-local"
          defaultValue={local}
          required
          readOnly={saving || saved}
        />
      </label>
      <label>
        What you observed
        <textarea
          name="description"
          defaultValue={report.description}
          minLength={5}
          maxLength={600}
          required
          readOnly={saving || saved}
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {saved && <p role="status">Changes saved for private review.</p>}
      <button
        className="button"
        type="submit"
        disabled={saving || saved || conflict}
      >
        {saving ? "Saving..." : "Save changes"}
      </button>
    </form>
  );
}
