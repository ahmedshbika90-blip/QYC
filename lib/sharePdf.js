// Turns an on-screen element into a PDF and opens the phone's share sheet
// (WhatsApp etc.), falling back to a download where sharing files isn't
// supported. Shared by the sales report and warehouse documents.
//
// How it avoids the problems found earlier:
//  - Captures an invisible off-screen CLONE, never the real page, so the
//    visible layout doesn't glitch or lose its scroll position.
//  - Widens the clone to the content's full width (explicit pixels from
//    scrollWidth — "max-content" silently fails against w-full tables), so
//    horizontally scrolling tables aren't cropped.
//  - Removes position:sticky in the clone (html2canvas renders it at the
//    wrong offset; it's only needed for on-screen scrolling anyway).
//  - Adds a page margin so it reads like a document, not a cropped screenshot.
//  - Renders the page as an image, which keeps Arabic text shaped correctly
//    (PDF libraries' own text drawing doesn't handle Arabic well).
//
// Returns true if shared/downloaded, false if the person closed the share
// sheet. Throws on real failures.
export async function shareElementAsPdf(source, { fileName, title }) {
  let fullWidth = source.scrollWidth;
  source.querySelectorAll(".overflow-x-auto").forEach((el) => {
    fullWidth = Math.max(fullWidth, el.scrollWidth);
  });

  let clone;
  try {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);

    clone = source.cloneNode(true);
    clone.style.position = "fixed";
    clone.style.top = "0";
    clone.style.insetInlineStart = "-99999px";
    clone.style.width = `${fullWidth}px`;
    clone.querySelectorAll(".overflow-x-auto").forEach((el) => {
      el.style.overflow = "visible";
      el.style.width = `${fullWidth}px`;
    });
    clone.querySelectorAll(".sticky").forEach((el) => {
      el.classList.remove("sticky", "start-0", "z-10");
      el.style.position = "static";
    });
    clone.querySelectorAll(".no-pdf").forEach((el) => el.remove());
    document.body.appendChild(clone);

    const canvas = await html2canvas(clone, {
      scale: 2,
      backgroundColor: "#ffffff",
      width: fullWidth,
      windowWidth: fullWidth,
    });
    const imgData = canvas.toDataURL("image/png");

    const margin = 80; // px, at the same 2x scale as the capture
    const pageWidth = canvas.width + margin * 2;
    const pageHeight = canvas.height + margin * 2;
    const pdf = new jsPDF({
      orientation: pageWidth > pageHeight ? "l" : "p",
      unit: "px",
      format: [pageWidth, pageHeight],
    });
    pdf.addImage(imgData, "PNG", margin, margin, canvas.width, canvas.height);
    const blob = pdf.output("blob");
    const file = new File([blob], fileName, { type: "application/pdf" });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title });
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    }
    return true;
  } catch (err) {
    if (err.name === "AbortError") return false; // closed the share sheet
    throw err;
  } finally {
    if (clone) clone.remove();
  }
}
