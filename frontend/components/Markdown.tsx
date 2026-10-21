import ReactMarkdown from "react-markdown";

/** Agent and route-case text, styled to match the app. */
export default function Markdown({ children }: { children: string }) {
  return (
    <div className="text-sm leading-relaxed space-y-2 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:text-xs [&_h2]:uppercase [&_h2]:tracking-[0.14em] [&_h2]:text-taste [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_strong]:text-text [&_strong]:font-semibold [&_p]:text-[#c9d2e3]">
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
}
