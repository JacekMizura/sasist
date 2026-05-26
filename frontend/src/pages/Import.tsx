import { useState } from "react"
import api from "../api/axios"

const productFields = [
  "name",
  "ean",
  "symbol",
  "length",
  "width",
  "height",
  "weight",
  "purchase_price",
  "image_url"
]

const orderFields = [
  "order_number",
  "ean",
  "quantity",
  "city",
  "country"
]

export default function Import() {
  const [file, setFile] = useState<File | null>(null)
  const [columns, setColumns] = useState<string[]>([])
  const [preview, setPreview] = useState<any[]>([])
  const [columnMap, setColumnMap] = useState<any>({})
  const [type, setType] = useState<"products" | "orders">("products")

  const fields = type === "products" ? productFields : orderFields

  const handlePreview = async () => {
    if (!file) return

    const formData = new FormData()
    formData.append("file", file)

    const res = await api.post("/import/preview/", formData)

    setColumns(res.data?.columns ?? [])
    setPreview(res.data?.preview ?? [])
  }

  const handleImport = async () => {
    if (!file) return

    const formData = new FormData()
    formData.append("file", file)
    formData.append("column_map", JSON.stringify(columnMap))

    const url =
      type === "products"
        ? "/import/products/?tenant_id=1"
        : "/import/orders/?tenant_id=1&warehouse_id=1"

    try {
      const res = await api.post(url, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      })
      if (res.status === 200 || res.status === 201) {
        alert("Import zakończony")
      } else {
        console.error("[Import] Unexpected status:", res.status, res.data)
      }
    } catch (err) {
      console.error("[Import] Błąd importu:", err)
      alert("Błąd importu. Sprawdź konsolę.")
    }
  }

  const handleMappingChange = (column: string, value: string) => {
    setColumnMap({
      ...columnMap,
      [value]: column
    })
  }

  return (
    <div className="p-8">
      <div className="w-full bg-white p-6 rounded-xl shadow">

        <h1 className="text-2xl font-semibold mb-6">
          Import danych
        </h1>

        {/* Typ importu */}
        <div className="flex gap-4 mb-6">
          <button
            className={`px-4 py-2 rounded ${type === "products" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
            onClick={() => setType("products")}
          >
            Produkty
          </button>
          <button
            className={`px-4 py-2 rounded ${type === "orders" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
            onClick={() => setType("orders")}
          >
            Zamówienia
          </button>
        </div>

        {/* Upload */}
        <input
          type="file"
          accept=".csv"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="mb-4"
        />

        <div className="flex gap-4 mb-6">
          <button
            onClick={handlePreview}
            className="bg-gray-800 text-white px-4 py-2 rounded"
          >
            Preview
          </button>

          <button
            onClick={handleImport}
            className="bg-green-600 text-white px-4 py-2 rounded"
          >
            Import
          </button>
        </div>

        {/* MAPOWANIE */}
        {columns.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-4">
              Mapowanie kolumn
            </h2>

            {columns.map((col) => (
              <div key={col} className="flex items-center gap-4 mb-2">
                <div className="w-48 text-sm">{col}</div>

                <select
                  className="border px-2 py-1 rounded"
                  onChange={(e) =>
                    handleMappingChange(col, e.target.value)
                  }
                >
                  <option value="">-- wybierz pole systemowe --</option>
                  {fields.map((field) => (
                    <option key={field} value={field}>
                      {field}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}

        {/* PREVIEW */}
        {preview.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border text-sm">
              <thead>
                <tr>
                  {columns.map((col) => (
                    <th key={col} className="border px-2 py-1">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i}>
                    {columns.map((col) => (
                      <td key={col} className="border px-2 py-1">
                        {row[col]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  )
}
