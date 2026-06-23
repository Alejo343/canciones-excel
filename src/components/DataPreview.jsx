export default function DataPreview({ data }) {
  if (!data || data.length === 0) return null;

  const columns = Object.keys(data[0]);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
            <tr>
              {columns.map((col) => (
                <th key={col} className="px-4 py-3 text-left font-medium">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.slice(0, 10).map((row, i) => (
              <tr key={i} className="hover:bg-gray-50">
                {columns.map((col) => (
                  <td key={col} className="px-4 py-2 text-gray-700">
                    {row[col] ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}
