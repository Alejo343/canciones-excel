import { useState } from "react";
import { parseFile } from "../utils/parseFile";

export default function DropZone({
  onDataLoaded,
  onFileLoaded,
  inputId = "file-input",
}) {
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState(null);
  const [error, setError] = useState(null);

  const handleFile = async (file) => {
    try {
      setError(null);
      if (onFileLoaded) {
        setFileName(file.name);
        onFileLoaded(file);
      } else {
        const data = await parseFile(file);
        setFileName(file.name);
        onDataLoaded(data);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleChange = (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
        dragging ? "border-blue-500 bg-blue-50" : "border-gray-300 bg-white"
      }`}
      onClick={() => document.getElementById(inputId).click()}
    >
      <p className="text-4xl mb-3">📂</p>
      <p className="text-gray-600 font-medium">
        Arrastra tu archivo aquí o haz clic para seleccionarlo
      </p>
      <p className="text-sm text-gray-400 mt-1">Soporta .csv, .xlsx, .xls</p>

      {fileName && (
        <p className="mt-4 text-green-600 font-medium">✓ {fileName} cargado</p>
      )}
      {error && <p className="mt-4 text-red-500 text-sm">✗ {error}</p>}

      <input
        id={inputId}
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
}
