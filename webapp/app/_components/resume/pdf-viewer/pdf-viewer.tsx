"use client";

import { ElementRef, useRef, useState } from "react";
import { pdfjs, Document, Page } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

import { useGlobalStore } from "@/stores/useGlobalStore";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.js",
  import.meta.url
).toString();

const PDFViewer = () => {
  const { file } = useGlobalStore();

  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);

  const documentRef = useRef<ElementRef<"div">>(null);

  function onDocumentLoadSuccess({
    numPages: _numPages,
  }: {
    numPages: number;
  }) {
    setNumPages(_numPages);
  }

  function handlePageChange() {
    documentRef.current?.scrollIntoView(); // needed to fix the page scroll jump issue on button click due to component re-render(?)
  }

  return (
    <>
      <Document
        inputRef={documentRef}
        file={file}
        onLoadSuccess={onDocumentLoadSuccess}
        className="flex flex-wrap"
      >
        <Page
          height={800}
          pageNumber={pageNumber}
          onLoadSuccess={handlePageChange}
        />
      </Document>
      <div id="page-controls" className="flex gap-2 text-black w-fit">
        <button
          className="disabled:opacity-50 p-2 enabled:hover:bg-gray-200"
          onClick={() => setPageNumber((num) => --num)}
          disabled={pageNumber === 1}
        >
          &lt;
        </button>
        <span className="p-2">
          Page {pageNumber} of {numPages}
        </span>
        <button
          className="disabled:opacity-50 p-2 enabled:hover:bg-gray-200"
          onClick={() => setPageNumber((num) => ++num)}
          disabled={pageNumber >= numPages}
        >
          &gt;
        </button>
      </div>
    </>
  );
};

export default PDFViewer;
