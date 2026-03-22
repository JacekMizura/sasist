# Analysis: Navigation from Warehouse Slot View to Product Card

**Goal:** When the user clicks a product in the slot panel (Magazyn view), navigate to the product details page. Analysis and implementation guidance only; no code changes.

---

## 1. Component that renders products in a slot

**Component:** **`MagazynProductsSidebar`**

**File:** `frontend/src/components/warehouse/magazyn/MagazynProductsSidebar.tsx`

**When it appears:** It is rendered from **WarehouseDesigner.tsx** when **mainView === "magazyn"** and a rack is selected (**selectedRackIdForSideView != null**). The user selects a **slot** by clicking a bin in **RackSideViewGrid**; that sets **selectedLocationForProducts** (level_index, segment_index). The sidebar then shows either:

- products in **that single bin** (when **showAllProductsInSidebar** is false), or  
- all products in the **selected rack** (when “Pokaż wszystkie produkty” is checked).

**Where product name / SKU / quantity are shown:** Inside the sidebar, **list.map((p) => ...)** (lines 104–141) renders one **div** per product with:

- Product image (or placeholder)
- **p.name** (product name)
- **p.sku**, **p.ean**
- **quantityAtLocation** (sztuki)
- Volume and location label

So the **slot panel** that lists products for the selected location is implemented entirely in **MagazynProductsSidebar**; product name, SKU, and quantity are all there.

---

## 2. Product object structure

**Type:** **`WarehouseProduct`** (from `frontend/src/types/warehouse.ts`).

**Relevant fields for navigation:**

- **`id: string`** — Stable identifier. In practice it comes from the API (product id as number) and is stored as string (e.g. `String(p.id)` when building the list in WarehouseDesigner). This is the same id used by the product API (`/products/${id}/`) and by **ProductDetail**.
- **`name`**, **`sku`**, **`ean`**, **`quantity`**, **`volume_dm3`**, **`assignedLocations`**, etc. are also present but not needed for routing.

**Conclusion:** Use **`p.id`** for navigation. It is a string; the product detail route accepts **:id** and **ProductDetail** uses **useParams** and calls **GET /products/${id}/**, so **`/products/${p.id}`** is the correct path. No **product_id** or **uuid** is required; **id** is sufficient.

---

## 3. Product page route

**Route definition:** **`App.tsx`** (around lines 72–76):

```tsx
<Route path="/products" element={<ProductsLayout />}>
  <Route index element={<Navigate to="list" replace />} />
  <Route path="list" element={<ProductList />} />
  <Route path=":id" element={<ProductDetail />} />
  ...
</Route>
```

**Full URL for a product card:** **`/products/${id}`** (e.g. `/products/42`).

**Product detail page:** **`frontend/src/pages/Products/ProductDetail.tsx`** — reads **id** from **useParams**, fetches **GET /products/${id}/**, and renders product details. So navigation to **`/products/${p.id}`** is correct.

---

## 4. Navigation method used in the project

**Observed patterns:**

- **`useNavigate()`** — e.g. **GlobalScanSearch** (`navigate(\`/products/${id}\`)`), **LabelSystem**, **ImportPage**.
- **`<Link to="...">`** — e.g. **AppLayout**, **MainLayout**, **ProductDetail** (back link to list).

**Recommendation:** Prefer **`<Link to={\`/products/${p.id}\`}>`** for the product row/card in the sidebar because:

- Works with middle-click / “Open in new tab”.
- Accessible (clear focus and semantics).
- No need to pass **useNavigate** into the sidebar or handle programmatic navigation.

Alternatively, **useNavigate** in the sidebar with **onClick** on the card is fine if you want navigation only on click (no link in the DOM). Both are valid; **Link** is slightly better for UX and consistency with other product links.

---

## 5. Best place to attach the click / link

**Current structure (MagazynProductsSidebar):** Each product is a **div** (lines 111–138) containing:

- A small image block
- A block with name, SKU/EAN, quantity, volume

There are no buttons or links on the product card today; the comment says “Magazyn view is read-only: no Edit / Remove from location buttons”.

**Options:**

1. **Product name only** — Wrap **`<div className="text-sm font-semibold ...">{p.name}</div>`** in **`<Link to={\`/products/${p.id}\`} className="... hover:underline text-cyan-400">`**. Clear “this goes to product”.
2. **Entire card** — Wrap the whole product **div** in **`<Link to={\`/products/${p.id}\`}>`** and add **cursor-pointer** and hover styling. Larger click area.
3. **Dedicated “Open product” control** — Add a small icon/button that navigates; keep the rest non-clickable. More explicit but extra UI.

**Recommendation:** **Option 2 — make the whole card a link.** Wrap the existing card **div** in **`<Link to={\`/products/${p.id}\`} className="block ...">`** (and move the card’s **className** onto the **Link** or an inner wrapper so layout and hover stay the same). If you prefer a smaller click target, use **Option 1** (name only as link). Avoid **Option 3** unless you explicitly want a separate action control.

---

## 6. Interaction conflicts

**Slot selection:** Done by clicking a **bin** in **RackSideViewGrid** (which calls **onBinClick** → **setSelectedLocationForProducts**). The sidebar only **displays** the list; it does not change slot selection. Clicking a **product** in the sidebar is a different target (sidebar, not grid), so no conflict with slot selection.

**Drag:** No drag is implemented in **MagazynProductsSidebar** (no drag handlers on product cards). No conflict.

**Product quantity editing:** The sidebar is read-only in Magazyn (no Edit/Remove). So there is no quantity editor or other control that would compete with a click-to-navigate. Adding navigation on the card or name does not conflict with editing.

**Search input:** The sidebar has a search field; clicking a product card does not interact with it. No conflict.

**Conclusion:** Attaching navigation to the product card (or product name) in **MagazynProductsSidebar** does not interfere with slot selection, drag, or editing. It is safe to add.

---

## 7. Implementation summary

| Item | Result |
|------|--------|
| **Component that renders products in a slot** | **MagazynProductsSidebar** (`frontend/src/components/warehouse/magazyn/MagazynProductsSidebar.tsx`). |
| **Product object** | **WarehouseProduct** with **`id: string`**; use **`p.id`** for the product page URL. |
| **Product page route** | **`/products/:id`** (e.g. `/products/42`). **ProductDetail** is rendered for that route. |
| **Where to attach navigation** | Either wrap the **whole product card** in **`<Link to={\`/products/${p.id}\`}>`** (recommended) or make only the **product name** a **Link**. |
| **How to navigate** | Use **`<Link to={\`/products/${p.id}\`}>`** from **react-router-dom** (recommended for links). Optionally use **useNavigate** and **onClick** on the card if you prefer programmatic navigation. |

**Concrete steps (no code applied):**

1. In **MagazynProductsSidebar.tsx**, import **Link** from **react-router-dom**.
2. In the **list.map** callback, wrap the product card (the outer **div** with **key={p.id}**) in **`<Link to={\`/products/${p.id}\`}>`**, or wrap only the product name **div** in **Link**.
3. If the whole card is a link, add **cursor-pointer** and a hover style (e.g. slight background or border) so it’s clear it’s clickable; ensure the link is still accessible (focus visible, no duplicate links if you add more links later).
4. Ensure **p.id** is always a string (it already is per **WarehouseProduct**); if the API ever returned a number, **\`/products/${p.id}\`** would still work.

No code was modified in this analysis.
