require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Product = require('../models/Product');

const sampleProducts = [
  {
    name: 'Dell UltraSharp 27" Monitor',
    sku: 'ELEC-MON-001',
    category: 'Electronics',
    price: 449.99,
    quantity: 18,
    reorderLevel: 5,
    supplier: 'TechSource Distributors',
  },
  {
    name: 'Logitech MX Master 3S Mouse',
    sku: 'ELEC-MOU-002',
    category: 'Electronics',
    price: 99.5,
    quantity: 4,
    reorderLevel: 10,
    supplier: 'TechSource Distributors',
  },
  {
    name: 'Keychron K2 Mechanical Keyboard',
    sku: 'ELEC-KEY-003',
    category: 'Electronics',
    price: 89.0,
    quantity: 42,
    reorderLevel: 8,
    supplier: 'PeripheralHub',
  },
  {
    name: 'USB-C Docking Station',
    sku: 'ELEC-DOC-004',
    category: 'Electronics',
    price: 159.0,
    quantity: 3,
    reorderLevel: 6,
    supplier: 'PeripheralHub',
  },
  {
    name: 'Ergonomic Mesh Office Chair',
    sku: 'FURN-CHR-001',
    category: 'Furniture',
    price: 320.0,
    quantity: 12,
    reorderLevel: 4,
    supplier: 'Workspace Direct',
  },
  {
    name: 'Standing Desk Frame Dual Motor',
    sku: 'FURN-DSK-002',
    category: 'Furniture',
    price: 410.0,
    quantity: 2,
    reorderLevel: 3,
    supplier: 'Workspace Direct',
  },
  {
    name: 'A4 Copy Paper (500 Sheets)',
    sku: 'OFFC-PAP-001',
    category: 'Office Supplies',
    price: 7.5,
    quantity: 120,
    reorderLevel: 30,
    supplier: 'PaperTrail Co.',
  },
  {
    name: 'Gel Ink Pens (Pack of 12)',
    sku: 'OFFC-PEN-002',
    category: 'Office Supplies',
    price: 11.25,
    quantity: 15,
    reorderLevel: 20,
    supplier: 'PaperTrail Co.',
  },
  {
    name: 'CAT6 Ethernet Patch Cable 5m',
    sku: 'NETW-CAB-001',
    category: 'Networking',
    price: 14.0,
    quantity: 65,
    reorderLevel: 15,
    supplier: 'NetLink Systems',
  },
  {
    name: 'Managed 24-Port Gigabit Switch',
    sku: 'NETW-SWT-002',
    category: 'Networking',
    price: 275.0,
    quantity: 0,
    reorderLevel: 2,
    supplier: 'NetLink Systems',
  },
  {
    name: 'Heavy Duty Shipping Boxes (25 Pack)',
    sku: 'PACK-BOX-001',
    category: 'Packaging',
    price: 38.0,
    quantity: 25,
    reorderLevel: 10,
    supplier: 'BoxCraft Supply',
  },
  {
    name: 'Bubble Wrap Roll 50m',
    sku: 'PACK-BUB-002',
    category: 'Packaging',
    price: 22.5,
    quantity: 5,
    reorderLevel: 5,
    supplier: 'BoxCraft Supply',
  },
];

async function seedDatabase() {
  try {
    await connectDB();
    await Product.deleteMany({});
    const inserted = await Product.insertMany(sampleProducts);
    console.log(`Seeded ${inserted.length} products successfully.`);
  } catch (error) {
    console.error('Seed failed:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
}

seedDatabase();
