# Asset Management – CSV Format for Import

Use the formats below so the data imports correctly and displays properly in the system.

---

## 1. Stock (Inventory) – `stock.csv`

**Purpose:** List of items you keep in inventory (e.g. laptops, monitors, mice, cables). Each row = one stock item type.

**Column order (header row required):**

| Column 1 | Column 2 | Column 3 | Column 4 |
|----------|----------|----------|----------|
| **Item Name** | *(unused)* | **Quantity** | **Description** |

- **Item Name** (required): Short, clear name. Use words that match the category (e.g. Laptop, Monitor, Mouse) so the system labels them correctly.
- **Column 2**: Leave empty or use for your own reference; the importer uses column index 2 (or 1) for quantity.
- **Quantity** (required): Whole number in stock (e.g. `5`).
- **Description** (optional): Extra details (brand, model, specs). These can be refined later in the app's Edit form (Brand, Model, etc.).

---

### 1a. Stock format for **laptops** (and desktops)

Use **Item Name** and **Description** so the system treats the row as **Systems**. Include the word **Laptop** or **Desktop** (or **CPU Systems**) in the name.

| Column 1 – Item Name | Column 2 | Column 3 – Quantity | Column 4 – Description |
|----------------------|----------|----------------------|--------------------------|
| Laptops | | 7 | Mixed i5/i7 8th Gen, 4 ready 3 faulty |
| Dell Laptop 14 inch | | 3 | Latitude 5420 |
| Desktop PCs | | 5 | Generic, for spares |
| 256 GB SSD NVMe (Laptop) | | 2 | M.2 for upgrades |
| 8 GB RAM DDR4 (Laptop) | | 4 | SODIMM DDR4 |

**Example – laptops / systems only:**

```csv
Item Name,,Quantity,Description
Laptops,,7,Mixed i5/i7 8th Gen, 4 ready 3 faulty
Dell Laptop 14 inch,,3,Latitude 5420
Desktop PCs,,5,Generic - for spares
256 GB SSD NVMe (Laptop),,2,M.2 for laptop upgrades
8 GB RAM DDR4 (Laptop),,4,SODIMM DDR4
```

---

### 1b. Stock format for **peripherals** (and other non-laptop items)

Use **Item Name** and **Description** so the system treats the row as **Peripherals**, **Display**, etc. Include the device type in the name (e.g. **Mouse**, **Monitor**, **Headphones**, **Keyboard**, **USB Hub**).

| Column 1 – Item Name | Column 2 | Column 3 – Quantity | Column 4 – Description |
|----------------------|----------|----------------------|--------------------------|
| LCD Monitors 24 inch | | 18 | 3 new Dell, 15 old |
| Logitech H390 Headphones | | 4 | USB wired headset |
| Wired Mouse | | 5 | Logitech B100 |
| Wireless Mouse | | 0 | Out of stock - reorder |
| Wired Keyboard | | 3 | Dell standard |
| USB Hub | | 3 | 4-port USB 3.0 |
| Mouse Pad | | 5 | Standard black |
| TP-Link Archer C80 Router | | 1 | Conference room |

**Example – peripherals only:**

```csv
Item Name,,Quantity,Description
LCD Monitors 24 inch,,18,3 new Dell 24-inch, 15 old models
Logitech H390 Headphones,,4,USB wired headset
Wired Mouse,,5,Logitech B100
Wireless Mouse,,0,Out of stock - reorder needed
Wired Keyboard,,3,Dell standard
USB Hub,,3,4-port USB 3.0
Mouse Pad,,5,Standard black
TP-Link Archer C80 Router,,1,Conference room
```

**Category keywords (use in Item Name so the app labels correctly):**

- **Systems** – Laptop, Desktop, CPU  
- **Display** – Monitor, LCD, LED  
- **Peripherals** – Mouse, Keyboard, Headphone, USB hub, Mouse pad  
- **Components** – RAM, Motherboard, DDR  
- **Storage** – HDD, SSD  
- **Network** – Router, Switch, RJ45, MikroTik, Archer  

---

### 1c. Combined example (laptops + peripherals in one file)

```csv
Item Name,,Quantity,Description
Laptops,,7,Mixed i5/i7 8th Gen, 4 ready 3 faulty
LCD Monitors 24 inch,,18,3 new 24-inch, 15 old models
Logitech H390 Headphones,,4,USB wired headset
8 GB RAM DDR4 (Laptop),,4,SODIMM DDR4
Wireless Mouse,,0,Out of stock - reorder needed
Wired Mouse,,5,Logitech B100
USB Hub,,3,4-port USB 3.0
```

---

## 2. System Inventory (Laptops / Desktops Assigned) – `system-inventory.csv`

**Purpose:** Laptops and desktops currently assigned to people. Each row = one assigned system. Asset ID (e.g. `SYS-2026-001`) is generated automatically.

**Column order (header row required):**

| Column 1 | Column 2 | Column 3 | Column 4 | Column 5 | Column 6 |
|----------|----------|----------|----------|----------|----------|
| **Assigned To (Full Name)** | **RAM** | **Storage** | **Processor** | **Generation** | **Notes (e.g. LED)** |

- **Assigned To**: **Exact full name as in the HR/Employees list** (e.g. `Taqi Mirza`, `Sohail Ahmad`). The system links to the employee by this name.
- **RAM**: e.g. `8 GB`, `16 GB`, `32 GB`.
- **Storage**: e.g. `256 GB`, `512 GB`, `1 TB`, `238 GB`.
- **Processor**: e.g. `i5`, `i7`, `Ryzen 5`.
- **Generation**: e.g. `8th Gen`, `11th Gen`, `12th Gen`.
- **Notes**: Optional (e.g. monitor model like `LED: Dell 24 inch`). Can be left empty.

**Example `system-inventory.csv`:**

```csv
Assigned To,RAM,Storage,Processor,Generation,Notes
Taqi Mirza,12 GB,128 GB,i7,8th Gen,
Sohail Ahmad,16 GB,238 GB,i7,8th Gen,
Arbaz Ahmed Khan,16 GB,238 GB,i7,8th Gen,
Saad Subzwari,16 GB,224 GB,i5,8th Gen,
Nate,16 GB,477 GB,i7,8th Gen,
Marcus,12 GB,585 GB,i5,3rd Gen,
Mam Leena,16 GB,256 GB SSD,i5,11th Gen,Dell 24 inch
```

---

## 3. New Inventory Assigned (Peripherals) – `new-inventory-assigned.csv`

**Purpose:** Peripherals and other non-laptop items assigned to people (mouse, keyboard, headphone, monitor, etc.). Each row = one assigned peripheral. Asset ID (e.g. `PERIPH-2026-001`) is generated automatically.

**Column order (header row required):**

| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| **Item / Device** | **Assigned To (Full Name)** | **Date or notes (optional)** |

- **Item / Device**: Short label, e.g. `Mouse`, `Logitech H390 Headphones`, `Dell 24 inch Monitor`, `Wired Keyboard`.
- **Assigned To**: **Exact full name as in the HR/Employees list**.
- **Date or notes**: Optional (e.g. assignment date or any note). Can be left empty.

**Example `new-inventory-assigned.csv`:**

```csv
Item,Assigned To,Date/Notes
Logitech H390 Headphones,Taqi Mirza,
Dell 24 inch Monitor,Sohail Ahmad,
Wired Mouse,Arbaz Ahmed Khan,
Wireless Keyboard,Marcus,Conference room
USB Hub,Nate,
```

---

## Important notes for your IT manager

1. **Encoding:** Save all CSVs as **UTF-8** (Excel: “Save As” → “CSV UTF-8 (Comma delimited)”).
2. **Headers:** Keep the first row as the header; the importer skips it.
3. **Commas in text:** If a cell contains a comma, wrap the whole cell in double quotes, e.g. `"Dell 24 inch, LED"`.
4. **Employee names:** “Assigned To” in the two assigned CSVs must match the **full name** of the employee exactly as it appears in the company’s employee list (e.g. first name + last name). This is how the system links the asset to the right person.
5. **Three files:** You need to provide all three files; the import command is:  
   `npx tsx server/db/importAssetCsvs.ts stock.csv system-inventory.csv new-inventory-assigned.csv`
6. **Stock samples:** In the `docs/` folder you can use `sample_stock_laptops.csv` and `sample_stock_peripherals.csv` as templates for laptops vs peripherals. For import, merge them into one `stock.csv` (same header, same 4 columns) or keep one file with both sections.

If you want different column names or extra columns for your own use, we can adjust the importer; the **column order** above must stay the same for the current script.
