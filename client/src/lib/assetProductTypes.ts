/**
 * Product type configuration for asset management.
 * Each product type defines which spec fields to show when adding/editing stock items.
 */

export type SpecFieldType = "select" | "input";

export interface SpecFieldConfig {
  key: string;
  label: string;
  type: SpecFieldType;
  placeholder?: string;
  options?: { value: string; label: string }[];
}

export interface ProductTypeConfig {
  id: string;
  label: string;
  category: string; // Maps to stock category
  icon?: string;
  specFields: SpecFieldConfig[];
}

export const PRODUCT_TYPES: ProductTypeConfig[] = [
  {
    id: "laptop",
    label: "Laptop",
    category: "Systems",
    specFields: [
      { key: "ram", label: "RAM", type: "select", options: [
        { value: "4 GB", label: "4 GB" },
        { value: "8 GB", label: "8 GB" },
        { value: "12 GB", label: "12 GB" },
        { value: "16 GB", label: "16 GB" },
        { value: "32 GB", label: "32 GB" },
        { value: "64 GB", label: "64 GB" },
      ]},
      { key: "storage", label: "Storage", type: "select", options: [
        { value: "128 GB", label: "128 GB" },
        { value: "256 GB", label: "256 GB" },
        { value: "512 GB", label: "512 GB" },
        { value: "1 TB", label: "1 TB" },
        { value: "2 TB", label: "2 TB" },
      ]},
      { key: "processor", label: "Processor", type: "select", options: [
        { value: "i3", label: "Intel Core i3" },
        { value: "i5", label: "Intel Core i5" },
        { value: "i7", label: "Intel Core i7" },
        { value: "i9", label: "Intel Core i9" },
        { value: "Ryzen 5", label: "AMD Ryzen 5" },
        { value: "Ryzen 7", label: "AMD Ryzen 7" },
        { value: "M1", label: "Apple M1" },
        { value: "M2", label: "Apple M2" },
        { value: "M3", label: "Apple M3" },
      ]},
      { key: "generation", label: "Generation", type: "select", options: [
        { value: "3rd Gen", label: "3rd Gen" },
        { value: "6th Gen", label: "6th Gen" },
        { value: "8th Gen", label: "8th Gen" },
        { value: "10th Gen", label: "10th Gen" },
        { value: "11th Gen", label: "11th Gen" },
        { value: "12th Gen", label: "12th Gen" },
        { value: "13th Gen", label: "13th Gen" },
        { value: "14th Gen", label: "14th Gen" },
      ]},
      { key: "displaySize", label: "Display Size", type: "select", options: [
        { value: "13\"", label: "13 inch" },
        { value: "14\"", label: "14 inch" },
        { value: "15.6\"", label: "15.6 inch" },
        { value: "16\"", label: "16 inch" },
        { value: "17\"", label: "17 inch" },
      ]},
      { key: "brand", label: "Brand", type: "input", placeholder: "e.g. Dell, HP, Lenovo" },
    ],
  },
  {
    id: "desktop",
    label: "Desktop",
    category: "Systems",
    specFields: [
      { key: "ram", label: "RAM", type: "select", options: [
        { value: "4 GB", label: "4 GB" },
        { value: "8 GB", label: "8 GB" },
        { value: "16 GB", label: "16 GB" },
        { value: "32 GB", label: "32 GB" },
        { value: "64 GB", label: "64 GB" },
      ]},
      { key: "storage", label: "Storage", type: "select", options: [
        { value: "256 GB", label: "256 GB" },
        { value: "512 GB", label: "512 GB" },
        { value: "1 TB", label: "1 TB" },
        { value: "2 TB", label: "2 TB" },
      ]},
      { key: "processor", label: "Processor", type: "select", options: [
        { value: "i3", label: "Intel Core i3" },
        { value: "i5", label: "Intel Core i5" },
        { value: "i7", label: "Intel Core i7" },
        { value: "i9", label: "Intel Core i9" },
        { value: "Ryzen 5", label: "AMD Ryzen 5" },
        { value: "Ryzen 7", label: "AMD Ryzen 7" },
      ]},
      { key: "generation", label: "Generation", type: "select", options: [
        { value: "8th Gen", label: "8th Gen" },
        { value: "10th Gen", label: "10th Gen" },
        { value: "11th Gen", label: "11th Gen" },
        { value: "12th Gen", label: "12th Gen" },
        { value: "13th Gen", label: "13th Gen" },
      ]},
      { key: "brand", label: "Brand", type: "input", placeholder: "e.g. Dell, HP" },
    ],
  },
  {
    id: "monitor",
    label: "Monitor",
    category: "Display",
    specFields: [
      { key: "size", label: "Screen Size", type: "select", options: [
        { value: "22\"", label: "22 inch" },
        { value: "24\"", label: "24 inch" },
        { value: "27\"", label: "27 inch" },
        { value: "32\"", label: "32 inch" },
        { value: "34\"", label: "34 inch (Ultrawide)" },
      ]},
      { key: "resolution", label: "Resolution", type: "select", options: [
        { value: "1920x1080", label: "Full HD (1920×1080)" },
        { value: "2560x1440", label: "QHD (2560×1440)" },
        { value: "3840x2160", label: "4K UHD (3840×2160)" },
        { value: "3440x1440", label: "Ultrawide (3440×1440)" },
      ]},
      { key: "panelType", label: "Panel Type", type: "select", options: [
        { value: "IPS", label: "IPS" },
        { value: "VA", label: "VA" },
        { value: "TN", label: "TN" },
        { value: "OLED", label: "OLED" },
      ]},
      { key: "refreshRate", label: "Refresh Rate", type: "select", options: [
        { value: "60Hz", label: "60 Hz" },
        { value: "75Hz", label: "75 Hz" },
        { value: "144Hz", label: "144 Hz" },
        { value: "165Hz", label: "165 Hz" },
        { value: "240Hz", label: "240 Hz" },
      ]},
      { key: "brand", label: "Brand", type: "input", placeholder: "e.g. Dell, LG, Samsung" },
    ],
  },
  {
    id: "storage",
    label: "Storage Drive",
    category: "Storage",
    specFields: [
      { key: "capacity", label: "Capacity", type: "select", options: [
        { value: "128 GB", label: "128 GB" },
        { value: "256 GB", label: "256 GB" },
        { value: "512 GB", label: "512 GB" },
        { value: "1 TB", label: "1 TB" },
        { value: "2 TB", label: "2 TB" },
      ]},
      { key: "type", label: "Type", type: "select", options: [
        { value: "SSD SATA", label: "SSD SATA" },
        { value: "SSD NVMe", label: "SSD NVMe" },
        { value: "HDD", label: "HDD" },
        { value: "M.2 NVMe", label: "M.2 NVMe" },
      ]},
      { key: "formFactor", label: "Form Factor", type: "select", options: [
        { value: "2.5\"", label: "2.5 inch" },
        { value: "M.2", label: "M.2" },
        { value: "3.5\"", label: "3.5 inch" },
      ]},
      { key: "brand", label: "Brand", type: "input", placeholder: "e.g. Samsung, WD, Crucial" },
    ],
  },
  {
    id: "ram",
    label: "RAM Module",
    category: "Components",
    specFields: [
      { key: "capacity", label: "Capacity", type: "select", options: [
        { value: "4 GB", label: "4 GB" },
        { value: "8 GB", label: "8 GB" },
        { value: "16 GB", label: "16 GB" },
        { value: "32 GB", label: "32 GB" },
      ]},
      { key: "type", label: "Type", type: "select", options: [
        { value: "DDR3", label: "DDR3" },
        { value: "DDR4", label: "DDR4" },
        { value: "DDR5", label: "DDR5" },
      ]},
      { key: "formFactor", label: "Form Factor", type: "select", options: [
        { value: "DIMM", label: "DIMM (Desktop)" },
        { value: "SODIMM", label: "SODIMM (Laptop)" },
      ]},
      { key: "speed", label: "Speed", type: "input", placeholder: "e.g. 3200 MHz" },
    ],
  },
  {
    id: "keyboard",
    label: "Keyboard",
    category: "Peripherals",
    specFields: [
      { key: "layout", label: "Layout", type: "select", options: [
        { value: "Full", label: "Full Size" },
        { value: "TKL", label: "Tenkeyless (TKL)" },
        { value: "Compact", label: "Compact" },
      ]},
      { key: "connectivity", label: "Connectivity", type: "select", options: [
        { value: "Wired", label: "Wired" },
        { value: "Wireless", label: "Wireless" },
        { value: "Both", label: "Wired + Wireless" },
      ]},
      { key: "switchType", label: "Switch Type", type: "input", placeholder: "e.g. Membrane, Mechanical" },
      { key: "brand", label: "Brand", type: "input", placeholder: "e.g. Logitech, Dell" },
    ],
  },
  {
    id: "mouse",
    label: "Mouse",
    category: "Peripherals",
    specFields: [
      { key: "connectivity", label: "Connectivity", type: "select", options: [
        { value: "Wired", label: "Wired" },
        { value: "Wireless", label: "Wireless" },
        { value: "Both", label: "Wired + Wireless" },
      ]},
      { key: "dpi", label: "DPI", type: "input", placeholder: "e.g. 1600, 3200" },
      { key: "brand", label: "Brand", type: "input", placeholder: "e.g. Logitech, Microsoft" },
    ],
  },
  {
    id: "headphones",
    label: "Headphones",
    category: "Peripherals",
    specFields: [
      { key: "connectivity", label: "Connectivity", type: "select", options: [
        { value: "Wired", label: "Wired" },
        { value: "Wireless", label: "Wireless" },
        { value: "USB", label: "USB" },
      ]},
      { key: "type", label: "Type", type: "select", options: [
        { value: "Over-ear", label: "Over-ear" },
        { value: "On-ear", label: "On-ear" },
        { value: "In-ear", label: "In-ear" },
      ]},
      { key: "brand", label: "Brand", type: "input", placeholder: "e.g. Logitech, Jabra" },
    ],
  },
  {
    id: "network",
    label: "Network Device",
    category: "Network",
    specFields: [
      { key: "type", label: "Device Type", type: "select", options: [
        { value: "Router", label: "Router" },
        { value: "Switch", label: "Switch" },
        { value: "Access Point", label: "Access Point" },
        { value: "Modem", label: "Modem" },
      ]},
      { key: "speed", label: "Speed", type: "select", options: [
        { value: "100 Mbps", label: "100 Mbps" },
        { value: "1 Gbps", label: "1 Gbps" },
        { value: "2.5 Gbps", label: "2.5 Gbps" },
        { value: "10 Gbps", label: "10 Gbps" },
      ]},
      { key: "ports", label: "Ports", type: "input", placeholder: "e.g. 8-port, 24-port" },
      { key: "brand", label: "Brand", type: "input", placeholder: "e.g. TP-Link, Cisco" },
    ],
  },
  {
    id: "other",
    label: "Other / Generic",
    category: "Other",
    specFields: [
      { key: "brand", label: "Brand", type: "input", placeholder: "Optional" },
      { key: "model", label: "Model", type: "input", placeholder: "Optional" },
    ],
  },
];

