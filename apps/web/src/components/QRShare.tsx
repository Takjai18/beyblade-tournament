import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, ExternalLink, X } from "lucide-react";
import { useT } from "../stores/localeStore";

interface Props {
  shareCode: string;
  tournamentName?: string;
  open: boolean;
  onClose: () => void;
}

export function QRShare({ shareCode, tournamentName, open, onClose }: Props) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const watchUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/watch/${shareCode}`
      : `/watch/${shareCode}`;

  if (!open) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(watchUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div
        className="card w-full max-w-sm space-y-4 border-cyan-400/30"
        role="dialog"
        aria-label={t("shareTitle")}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold">{t("shareTitle")}</h3>
            {tournamentName && (
              <p className="mt-0.5 text-sm text-slate-400">{tournamentName}</p>
            )}
          </div>
          <button
            type="button"
            className="btn-ghost !p-2"
            onClick={onClose}
            aria-label={t("close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col items-center gap-3">
          <div className="rounded-2xl bg-white p-4">
            <QRCodeSVG
              value={watchUrl}
              size={200}
              level="M"
              includeMargin={false}
              bgColor="#ffffff"
              fgColor="#020617"
            />
          </div>
          <p className="text-center text-xs text-slate-500">{t("scanQr")}</p>
        </div>

        <div>
          <label className="label">{t("watchUrl")}</label>
          <div className="flex gap-2">
            <input
              className="input font-mono text-xs"
              readOnly
              value={watchUrl}
              onFocus={(e) => e.target.select()}
            />
            <button type="button" className="btn-secondary shrink-0" onClick={copy}>
              {copied ? (
                <Check className="h-4 w-4 text-emerald-400" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
          </div>
          {copied && (
            <p className="mt-1 text-xs text-cyan-400">{t("linkCopied")}</p>
          )}
        </div>

        <div className="flex gap-2">
          <a
            href={watchUrl}
            target="_blank"
            rel="noreferrer"
            className="btn-primary flex-1"
          >
            <ExternalLink className="h-4 w-4" />
            {t("openWatch")}
          </a>
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t("close")}
          </button>
        </div>
      </div>
    </div>
  );
}
