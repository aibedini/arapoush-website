/**
 * A field people never see or reach (off-screen, out of the tab order, hidden from assistive tech).
 * Form-filling bots tend to complete it; /api/forms then quietly drops the submission.
 */
export default function Honeypot({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div aria-hidden="true" style={{ position: "absolute", insetInlineStart: "-10000px", inlineSize: 1, blockSize: 1, overflow: "hidden" }}>
      <label>
        Website
        <input type="text" name="website" tabIndex={-1} autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
    </div>
  );
}
