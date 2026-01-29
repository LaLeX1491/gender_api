"use client";

import { useState, useEffect, useRef } from "react";
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
  const [action, setAction] = useState<"delete" | "ignore" | "useDefault">("ignore");
  const [showProgress, setShowProgress] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number | null }>({ current: 0, total: null });
  
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [firstNameColumn, setFirstNameColumn] = useState<string>("");
  const [lastNameColumn, setLastNameColumn] = useState<string>("");
  const [locationColumn, setLocationColumn] = useState<string>("");
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isGerman = typeof navigator !== 'undefined' && navigator.language.startsWith('de');
  
  const [maleAddressLine, setMaleAddressLine] = useState(
    isGerman ? "Sehr geehrter Herr %lastName%" : "Dear Mr. %lastName%"
  );
  const [femaleAddressLine, setFemaleAddressLine] = useState(
    isGerman ? "Sehr geehrte Frau %lastName%" : "Dear Mrs. %lastName%"
  );
  const [defaultAddressLine, setDefaultAddressLine] = useState(
    isGerman ? "Sehr geehrte Damen und Herren" : "Dear Sir or Madam"
  );

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

  async function onFileSelect(file: File) {
    setSelectedFile(file);
    setCurrentFormat(getFormat(file));
    setStatus(undefined);
    setRawRecords([]);
    setGenderData([]);
    setProgress({ current: 0, total: null });
    setShowProgress(false);
    setFadeOut(false);
    
    // Spalten aus Datei extrahieren
    const formData = new FormData();
    formData.append("file", file);
    
    try {
      const res = await fetch(`/api/columns`, { method: "POST", body: formData });
      const { columns } = await res.json();
      setAvailableColumns(columns);
      
      // Auto-detect gängige Spaltennamen
      const lowerColumns = columns.map((c: string) => c.toLowerCase());
      const firstNameIdx = lowerColumns.findIndex((c: string) => 
        c.includes("firstname") || c.includes("vorname") || c.includes("first")
      );
      const lastNameIdx = lowerColumns.findIndex((c: string) => 
        c.includes("lastname") || c.includes("nachname") || c.includes("last") || c.includes("name")
      );
      const locationIdx = lowerColumns.findIndex((c: string) => 
        c.includes("location") || c.includes("ort") || c.includes("city") || c.includes("stadt")
      );
      
      if (firstNameIdx >= 0) setFirstNameColumn(columns[firstNameIdx]);
      if (lastNameIdx >= 0) setLastNameColumn(columns[lastNameIdx]);
      if (locationIdx >= 0) setLocationColumn(columns[locationIdx]);
    } catch (error) {
      console.error("Fehler beim Laden der Spalten:", error);
    }
  }

  function resetFile() {
    setSelectedFile(null);
    setCurrentFormat(undefined);
    setStatus(undefined);
    setRawRecords([]);
    setGenderData([]);
    setProgress({ current: 0, total: null });
    setShowProgress(false);
    setFadeOut(false);
    setAvailableColumns([]);
    setFirstNameColumn("");
    setLastNameColumn("");
    setLocationColumn("");
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function handleUpload() {
    if (!selectedFile || !currentFormat || !firstNameColumn || !lastNameColumn || !locationColumn) return;

    setLoading(true);
    setProgress({ current: 0, total: null });
    setShowProgress(true);
    setFadeOut(false);
    setStatus("Starting upload...");

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("firstNameColumn", firstNameColumn);
    formData.append("lastNameColumn", lastNameColumn);
    formData.append("locationColumn", locationColumn);

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
      action: action
    });

    const res = await fetch(`/api/format?${params.toString()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        records: rawRecords,
        genderData: genderData,
        maleAddressLine,
        femaleAddressLine,
        defaultAddressLine
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

  const isUploadReady = selectedFile && firstNameColumn && lastNameColumn && locationColumn;

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient from-slate-100 to-slate-200 p-4">
      <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-xl space-y-5">
        <header>
          <h1 className="text-2xl font-semibold">Gender filter</h1>
          <p className="text-sm text-slate-500">
            Upload a CSV/XLSX/XLSM/XLSB/XLS file.
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
                resetFile();
              }}
              className="absolute top-2 right-2 text-red-500 hover:text-red-700 p-1 rounded-full bg-white shadow z-10 pointer-events-auto"
            >
              <FaTimes size={14} />
            </button>
          )}

          <input
            ref={fileInputRef}
            id="file"
            type="file"
            accept=".csv,.xlsx,.xlsm,.xlsb,.xls"
            className="hidden"
            disabled={loading}
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                onFileSelect(e.target.files[0]);
              }
            }}
          />
        </div>

        {availableColumns.length > 0 && (
          <div className="space-y-3 p-4 bg-slate-50 rounded-lg">
            <h3 className="text-sm font-semibold">Column Mapping</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">First Name Column</label>
                <Select value={firstNameColumn} onValueChange={setFirstNameColumn}>
                  <SelectTrigger className="border rounded-sm">
                    <SelectValue placeholder="Select column" />
                  </SelectTrigger>
                  <SelectContent className="bg-white rounded-lg border border-slate-200 shadow-lg">
                    {availableColumns.map(col => (
                      <SelectItem key={col} value={col}>{col}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">Last Name Column</label>
                <Select value={lastNameColumn} onValueChange={setLastNameColumn}>
                  <SelectTrigger className="border rounded-sm">
                    <SelectValue placeholder="Select column" />
                  </SelectTrigger>
                  <SelectContent className="bg-white rounded-lg border border-slate-200 shadow-lg">
                    {availableColumns.map(col => (
                      <SelectItem key={col} value={col}>{col}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">Location Column</label>
                <Select value={locationColumn} onValueChange={setLocationColumn}>
                  <SelectTrigger className="border rounded-sm">
                    <SelectValue placeholder="Select column" />
                  </SelectTrigger>
                  <SelectContent className="bg-white rounded-lg border border-slate-200 shadow-lg">
                    {availableColumns.map(col => (
                      <SelectItem key={col} value={col}>{col}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        <Accordion type="single" collapsible className="border-t border-slate-300">
          <AccordionItem value="options">
            <AccordionTrigger className="py-2 flex justify-between w-full items-center">
              Additional Options
            </AccordionTrigger>

            <AccordionContent className="space-y-3">
              <div className="flex flex-col gap-1">
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

              <div className="flex flex-col gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <label className="text-sm font-medium">Address lines (use %firstName% and %lastName% as placeholders)</label>
                  </TooltipTrigger>
                  <TooltipContent className="text-center" side="left">
                    Define custom address lines for male, female, and default cases.<br />
                    Placeholders: %firstName%, %lastName%
                  </TooltipContent>
                </Tooltip>

                <div className="space-y-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-slate-600">Male address line</label>
                    <Input 
                      value={maleAddressLine} 
                      onChange={(e) => setMaleAddressLine(e.target.value)}
                      placeholder="Dear Mr. %lastName%"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-slate-600">Female address line</label>
                    <Input 
                      value={femaleAddressLine} 
                      onChange={(e) => setFemaleAddressLine(e.target.value)}
                      placeholder="Dear Mrs. %lastName%"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-slate-600">Default address line (when prediction fails)</label>
                    <Input 
                      value={defaultAddressLine} 
                      onChange={(e) => setDefaultAddressLine(e.target.value)}
                      placeholder="Dear Sir or Madam"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <label className="text-sm font-medium">Prediction threshold</label>
                  </TooltipTrigger>
                  <TooltipContent className="text-center" side="left">
                    The AI returns a confidence score (0–100%) indicating how likely the prediction is correct.<br />
                    Set a threshold below which the action below will be applied.
                  </TooltipContent>
                </Tooltip>

                <div className="flex gap-1">
                  <div className="relative">
                    <Input 
                      type="number" 
                      className="pr-6" 
                      min={50} 
                      max={100} 
                      value={threshold}
                      onChange={(e) => setThreshold(Number(e.target.value))}
                    />
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500">%</span>
                  </div>
                  
                  <Select value={action} onValueChange={(s: "delete" | "ignore" | "useDefault") => setAction(s)}>
                    <SelectTrigger className="border rounded-sm w-full">
                      <SelectValue />
                    </SelectTrigger>

                    <SelectContent className="bg-white rounded-lg border border-slate-200 shadow-lg">
                      <SelectItem value="delete">
                        <Tooltip>
                          <TooltipTrigger>
                            Delete row
                          </TooltipTrigger>
                          <TooltipContent>
                            Delete the row where the prediction was below the threshold
                          </TooltipContent>
                        </Tooltip>
                      </SelectItem>
                      <SelectItem value="ignore">
                        <Tooltip>
                          <TooltipTrigger>
                            Ignore row
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            Leave address line empty where prediction was below threshold
                          </TooltipContent>
                        </Tooltip>
                      </SelectItem>
                      <SelectItem value="useDefault">
                        <Tooltip>
                          <TooltipTrigger>
                            Use default
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            Use default address line where prediction was below threshold
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
         disabled={!isUploadReady || loading || genderData.length > 0}
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
              {progress.total !== null ? `${progress.current} of ${progress.total} batches complete` : "Calculating..."}
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