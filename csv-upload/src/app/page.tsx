"use client";

import { useState, useEffect } from "react";
import clsx from "clsx";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Select,
  SelectItem,
  SelectContent,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  Input,
  Spinner,
  Progress,
  Button
} from "@/components/ui";
import getFormat from "@/lib/extractFileFormat";
import { FaTimes } from "react-icons/fa";

type ResultRecord = { id: number; gender: string; probability: number };

export default function Page() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [currentFormat, setCurrentFormat] = useState<string>();
  const [status, setStatus] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [rawRecords, setRawRecords] = useState<any[]>([]);
  const [genderData, setGenderData] = useState<ResultRecord[]>([]);
  const [threshold, setThreshold] = useState<number>(70);
  const [action, setAction] = useState<"delete" | "ignore">("ignore");
  const [addressLang, setAddressLang] = useState<"de" | "en">("de");
  const [progress, setProgress] = useState<{ current: number; total: number | null }>({ current: 0, total: null });
  const [showProgress, setShowProgress] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    if (progress.total !== null && progress.current === progress.total && progress.total > 0) {
      const fadeTimer = setTimeout(() => {
        setFadeOut(true);
        const hideTimer = setTimeout(() => {
          setShowProgress(false);
          setFadeOut(false);
        }, 300);
        return () => clearTimeout(hideTimer);
      }, 1000);
      return () => clearTimeout(fadeTimer);
    }
  }, [progress]);

  function onFileSelect(file: File) {
    setSelectedFile(file);
    setCurrentFormat(getFormat(file));
    setStatus(undefined);
    setRawRecords([]);
    setGenderData([]);
    setProgress({ current: 0, total: null });
    setShowProgress(false);
    setFadeOut(false);
  }

  async function handleUpload() {
    if (!selectedFile || !currentFormat) return;

    setLoading(true);
    setProgress({ current: 0, total: null });
    setShowProgress(true);
    setFadeOut(false);
    setStatus("Starting upload...");

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const res = await fetch(`/api/upload`, { method: "POST", body: formData });

      if (!res.body) {
        setStatus("No response body");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;

          const eventMatch = line.match(/^event: (\w+)\ndata: (.+)$/);
          if (!eventMatch) continue;

          const [, event, data] = eventMatch;
          const parsed = JSON.parse(data);

          switch (event) {
            case "STATUS":
              setStatus(parsed.message);
              if (parsed.step !== undefined && parsed.total !== undefined) {
                setProgress({ current: parsed.step, total: parsed.total });
              } else if (parsed.step !== undefined) {
                setProgress(prev => ({ current: parsed.step, total: prev.total }));
              }
              break;

            case "PROGRESS":
              setProgress({ current: parsed.step, total: parsed.total });
              break;

            case "ERROR":
              setStatus(parsed.message || "Upload failed");
              setLoading(false);
              return;

            case "DONE":
              setGenderData(parsed.json);
              setRawRecords(parsed.records);
              setStatus("Processing complete!");
              break;
          }
        }
      }
    } catch (error) {
      setStatus("Upload failed: " + (error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function downloadFile() {
    if (genderData.length === 0 || !currentFormat) return;

    const params = new URLSearchParams({
      outputFormat: currentFormat,
      threshold: threshold.toString(),
      action: action,
      addressLang: addressLang
    });

    const res = await fetch(`/api/format?${params.toString()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        records: rawRecords,
        genderData: genderData
      })
    });

    const { file } = await res.json();
    const bytes = Uint8Array.from(atob(file.base64), c => c.charCodeAt(0));

    const mimeMap: Record<string, string> = {
      csv: "text/csv",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
      xlsb: "application/vnd.ms-excel.sheet.binary.macroEnabled.12",
      xls: "application/vnd.ms-excel",
    };

    const blob = new Blob([bytes], { type: mimeMap[currentFormat] ?? "application/octet-stream" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `genderized.${currentFormat}`;
    a.click();

    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient from-slate-100 to-slate-200 p-4">
      <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-xl space-y-5">
        <header>
          <h1 className="text-2xl font-semibold">Gender filter</h1>
          <p className="text-sm text-slate-500">
            Upload a CSV/XLSX/XLSM/XLSB/XLS file.
          </p>
          <p className="text-sm text-red-600">
            Important: The file needs to contain the fields <code className="p-1 bg-slate-50 rounded-sm">firstName</code> <code className="p-1 bg-slate-50 rounded-sm">lastName</code> and <code className="p-1 bg-slate-50 rounded-sm">location</code>
          </p>
        </header>

        <div className="relative">
          <label
            htmlFor="file"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                onFileSelect(e.dataTransfer.files[0]);
                e.dataTransfer.clearData();
              }
            }}
            className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 p-6 cursor-pointer hover:bg-slate-50 transition"
          >
            <span className="text-sm font-medium">
              {selectedFile ? selectedFile.name : "Click to select or drag & drop a file"}
            </span>
          </label>
          
          {selectedFile && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedFile(null);
                setCurrentFormat(undefined);
                setStatus(undefined);
                setRawRecords([]);
                setGenderData([]);
                setProgress({ current: 0, total: null });
                setShowProgress(false);
                setFadeOut(false);
              }}
              className="absolute top-2 right-2 text-red-500 hover:text-red-700 p-1 rounded-full bg-white shadow z-10 pointer-events-auto"
            >
              <FaTimes size={14} />
            </button>
          )}

          <input
            id="file"
            type="file"
            accept=".csv,.xlsx,.xlsm,.xlsb,.xls"
            className="hidden"
            disabled={loading}
            onChange={(e) =>
              e.target.files && onFileSelect(e.target.files[0])
            }
          />
        </div>

        <Accordion type="single" collapsible className="border-t border-slate-300">
          <AccordionItem value="options">
            <AccordionTrigger className="py-2 flex justify-between w-full items-center">
              Additional Options
            </AccordionTrigger>

            <AccordionContent className="space-y-3 flex flex-wrap">
              <div className="flex flex-col gap-1 w-1/2">
                <label className="text-sm font-medium">Output format</label>

                <Select value={currentFormat} onValueChange={setCurrentFormat}>
                  <SelectTrigger className="border rounded-sm w-1/2">
                    <SelectValue placeholder="Choose file format" />
                  </SelectTrigger>

                  <SelectContent className="bg-white rounded-lg border border-slate-200 shadow-lg">
                    <SelectItem value="csv">CSV</SelectItem>
                    <SelectItem value="xlsx">XLSX</SelectItem>
                    <SelectItem value="xlsm">XLSM</SelectItem>
                    <SelectItem value="xlsb">XLSB</SelectItem>
                    <SelectItem value="xls">XLS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1 w-1/2">
                <label className="text-sm font-medium">Address Language</label>

                <Select value={addressLang} onValueChange={(v: "de" | "en") => setAddressLang(v)}>
                  <SelectTrigger className="border rounded-sm w-1/2">
                    <SelectValue />
                  </SelectTrigger>

                  <SelectContent className="bg-white rounded-lg border border-slate-200 shadow-lg">
                    <SelectItem value="de">Deutsch</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1 w-1/2">
                <Tooltip>
                  <TooltipTrigger asChild><label className="text-sm font-medium">Prediction threshold</label></TooltipTrigger>
                  <TooltipContent className="text-center" side="left">The AI returns a confidence score (0–100%) indicating how likely the prediction is correct.<br />Set a threshold below which no gender will be applied.</TooltipContent>
                </Tooltip>

                <div className="flex gap-1">
                  <div className="relative ">
                    <Input type="number" className="pr-6" min={50} max={100} onInput={(e: React.FormEvent<HTMLInputElement>) => setThreshold(Number(e.currentTarget.value))} defaultValue={threshold}></Input>
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500">%</span>
                  </div>
                  
                  <Select value={action} onValueChange={(s: "delete" | "ignore") => setAction(s)}>
                    <SelectTrigger className="border rounded-sm w-1/2">
                      <SelectValue />
                    </SelectTrigger>

                    <SelectContent className="bg-white rounded-lg border border-slate-200 shadow-lg">
                      <SelectItem value="delete">
                        <Tooltip>
                          <TooltipTrigger>
                            Delete row
                          </TooltipTrigger>
                          <TooltipContent>
                            Delete the row, where the prediction was below the threshold
                          </TooltipContent>
                        </Tooltip>
                      </SelectItem>
                      <SelectItem value="ignore">
                        <Tooltip>
                          <TooltipTrigger>
                            Ignore row
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            Ignore the row (generate no prediction / address), where the prediction was below the threshold
                          </TooltipContent>
                        </Tooltip>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <Button
         disabled={!selectedFile || loading || genderData.length > 0}
         onClick={handleUpload}
         className={"w-full rounded-lg px-4 py-2 text-white transition flex items-center justify-center gap-2"}
        >
         {loading && <Spinner />}
         {loading ? "Processing..." : genderData.length > 0 ? "File already uploaded" : "Confirm & Upload"}
        </Button>

        {showProgress && (
          <div className={`space-y-2 transition-opacity duration-300 ${fadeOut ? 'opacity-0' : 'opacity-100'}`}>
            <Progress value={progress.total !== null ? (progress.current / progress.total) * 100 : 0} />
            <p className="text-sm text-center text-slate-600">
              {progress.total !== null ? `Step ${progress.current} of ${progress.total}` : "Calculating..."}
            </p>
          </div>
        )}

        {status && (
          <div className="rounded-lg bg-slate-100 px-4 py-2 text-sm">
            {status}
          </div>
        )}

        {genderData.length > 0 && (
          <Button
            variant="outline"
            className="w-full cursor-pointer"
            onClick={downloadFile}
          >
            Download File
          </Button>
        )}
      </div>
    </main>
  );
}