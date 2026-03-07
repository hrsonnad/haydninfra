import type { Dictionary } from "@/i18n/types";
import { getVersion } from "@/lib/version";

export function Footer({ dict }: { dict: Dictionary }) {
  const version = getVersion();
  return (
    <footer className="border-t border-slate-200 dark:border-slate-700 py-8 px-6">
      <div className="max-w-6xl mx-auto text-center text-sm text-slate-500 dark:text-slate-400">
        <div>&copy; {new Date().getFullYear()} {dict.metadata.title}. {dict.footer.rights}</div>
        {version !== "dev" && (
          <div className="mt-2 text-xs text-slate-400 dark:text-slate-500" data-site-version>
            {version}
          </div>
        )}
      </div>
    </footer>
  );
}