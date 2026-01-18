export type TextareaCaretRect = {
  top: number;
  left: number;
  height: number;
};

const STYLE_PROPS = [
  "direction",
  "boxSizing",
  "width",
  "height",
  "overflowX",
  "overflowY",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "fontStyle",
  "fontVariant",
  "fontWeight",
  "fontStretch",
  "fontSize",
  "lineHeight",
  "fontFamily",
  "letterSpacing",
  "textTransform",
  "textIndent",
  "textAlign",
  "wordSpacing",
  "tabSize",
] as const;

function syncMirrorStyles(textarea: HTMLTextAreaElement, mirror: HTMLDivElement) {
  const styles = window.getComputedStyle(textarea);
  for (const prop of STYLE_PROPS) {
    mirror.style[prop] = styles[prop];
  }
  mirror.style.width = styles.width;
  mirror.style.height = styles.height;
}

export function createTextareaCaretMeasurer(textarea: HTMLTextAreaElement) {
  const mirror = document.createElement("div");
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.pointerEvents = "none";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.wordWrap = "break-word";
  mirror.style.top = "0";
  mirror.style.left = "-9999px";
  mirror.style.contain = "layout style";

  document.body.appendChild(mirror);
  syncMirrorStyles(textarea, mirror);

  function measure(index: number): TextareaCaretRect {
    syncMirrorStyles(textarea, mirror);

    const clamped = Math.max(0, Math.min(index, textarea.value.length));
    const before = textarea.value.slice(0, clamped);
    const after = textarea.value.slice(clamped);

    const beforeText = before.endsWith("\n") ? `${before}\u200b` : before;
    mirror.textContent = beforeText;

    const span = document.createElement("span");
    span.textContent = after || "\u200b";
    mirror.appendChild(span);

    const spanRect = span.getBoundingClientRect();
    const mirrorRect = mirror.getBoundingClientRect();
    span.remove();

    const textareaRect = textarea.getBoundingClientRect();
    return {
      top: textareaRect.top + (spanRect.top - mirrorRect.top) - textarea.scrollTop,
      left: textareaRect.left + (spanRect.left - mirrorRect.left) - textarea.scrollLeft,
      height: spanRect.height,
    };
  }

  function dispose() {
    mirror.remove();
  }

  return { measure, dispose };
}
