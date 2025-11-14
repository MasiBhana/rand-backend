// index.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

const PRODUCTS_FILE = path.join(__dirname, 'products.json');
const USERS_FILE = path.join(__dirname, 'users.json');
const ORDERS_FILE = path.join(__dirname, 'orders.json');

// --- helper functions for products ---
function loadProducts() {
  try {
    const raw = fs.readFileSync(PRODUCTS_FILE, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error('Error loading products.json:', e.message);
    return [];
  }
}

function saveProducts(products) {
  try {
    fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving products.json:', e.message);
  }
}

// --- helper functions for users ---
function loadUsers() {
  try {
    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error('Error loading users.json:', e.message);
    return [];
  }
}

function saveUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving users.json:', e.message);
  }
}

// --- helper functions for orders ---
function loadOrders() {
  try {
    const raw = fs.readFileSync(ORDERS_FILE, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error('Error loading orders.json:', e.message);
    return [];
  }
}

function saveOrders(orders) {
  try {
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving orders.json:', e.message);
  }
}

let products = loadProducts();
let users = loadUsers();
let orders = loadOrders();

// simple in-memory sessions
const sessions = {}; // token -> userId

// figure out next order id from existing data
let nextOrderId = orders.length ? Math.max(...orders.map((o) => o.id || 0)) + 1 : 1;

const VALID_STATUSES = [
  'pending',
  'packed',
  'out_for_delivery',
  'delivered',
  'cancelled'
];

function createToken(userId) {
  const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
  sessions[token] = userId;
  return token;
}

function getUserFromToken(req) {
  const token = req.headers['x-auth-token'];
  if (!token) return null;
  const userId = sessions[token];
  if (!userId) return null;
  return users.find((u) => u.id === userId) || null;
}

// --- role guards for admin ---
function requireAdmin(req, res, next) {
  const user = getUserFromToken(req);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin only' });
  }
  req.user = user;
  next();
}

function requireAdminOrRep(req, res, next) {
  const user = getUserFromToken(req);
  if (!user || (user.role !== 'admin' && user.role !== 'rep')) {
    return res.status(403).json({ message: 'Admin or rep only' });
  }
  req.user = user;
  next();
}

// --- health ---
app.get('/', (req, res) => {
  res.json({ message: 'Rand Cash & Carry API is running' });
});

// --- AUTH ---
// register new customer
app.post('/auth/register', (req, res) => {
  const { name, phone, password } = req.body;
  if (!name || !phone || !password) {
    return res.status(400).json({ message: 'name, phone, password are required' });
  }

  const existing = users.find((u) => u.phone === String(phone));
  if (existing) {
    return res.status(400).json({ message: 'Phone already registered' });
  }

  const newId = users.length ? Math.max(...users.map((u) => u.id)) + 1 : 1;
  const user = {
    id: newId,
    name: String(name),
    phone: String(phone),
    password: String(password), // plain for demo
    role: 'customer'
  };

  users.push(user);
  saveUsers(users);

  const token = createToken(user.id);
  const { password: _, ...safeUser } = user;
  res.status(201).json({ token, user: safeUser });
});

// login: customer / rep / admin
app.post('/auth/login', (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) {
    return res.status(400).json({ message: 'phone and password required' });
  }

  const user = users.find(
    (u) => u.phone === String(phone) && u.password === String(password)
  );
  if (!user) {
    return res.status(401).json({ message: 'Invalid phone or password' });
  }

  const token = createToken(user.id);
  const { password: _, ...safeUser } = user;
  res.json({ token, user: safeUser });
});

// --- PRODUCTS for app ---
app.get('/products', (req, res) => {
  const publicProducts = products.map((p) => ({
    id: p.id,
    name: p.name,
    pack_size: p.pack_size,
    price: p.price,
    isSpecial: !!p.isSpecial
  }));
  res.json(publicProducts);
});

// --- ADMIN PRODUCTS API (protected) ---
app.get('/admin/products', requireAdmin, (req, res) => {
  res.json(products);
});

app.post('/admin/products', requireAdmin, (req, res) => {
  const { name, pack_size, price, isSpecial } = req.body;
  if (!name || !pack_size || price === undefined || price === null) {
    return res
      .status(400)
      .json({ message: 'name, pack_size and price are required' });
  }

  const newId = products.length ? Math.max(...products.map((p) => p.id)) + 1 : 1;
  const product = {
    id: newId,
    name: String(name),
    pack_size: String(pack_size),
    price: Number(price),
    isSpecial: !!isSpecial
  };

  products.push(product);
  saveProducts(products);

  res.status(201).json(product);
});

app.patch('/admin/products/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const product = products.find((p) => p.id === id);
  if (!product) {
    return res.status(404).json({ message: 'Product not found' });
  }

  const { price, isSpecial } = req.body;
  if (price !== undefined && price !== null && price !== '') {
    product.price = Number(price);
  }
  if (typeof isSpecial === 'boolean') {
    product.isSpecial = isSpecial;
  }

  saveProducts(products);
  res.json(product);
});

// --- ORDERS ---
app.post('/orders', (req, res) => {
  const { items, customerName, note, location } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'No items in order' });
  }

  const user = getUserFromToken(req);

  let total = 0;
  const detailedItems = items.map((it) => {
    const product = products.find((p) => p.id === it.productId);
    if (!product) {
      throw new Error('Invalid productId: ' + it.productId);
    }
    const lineTotal = product.price * it.qty;
    total += lineTotal;
    return {
      productId: product.id,
      name: product.name,
      qty: it.qty,
      price: product.price,
      lineTotal
    };
  });

  const order = {
    id: nextOrderId++,
    status: 'pending',
    customerName: customerName || (user ? user.name : 'Unknown customer'),
    note: note || '',
    location: location || null,
    user: user
      ? { id: user.id, name: user.name, phone: user.phone, role: user.role }
      : null,
    items: detailedItems,
    total,
    createdAt: new Date().toISOString()
  };

  orders.push(order);
  saveOrders(orders);

  console.log('New order:', order);

  res.status(201).json(order);
});

// all orders (for admin / rep only)
app.get('/orders', requireAdminOrRep, (req, res) => {
  res.json(orders);
});

// "my orders" for logged-in user (mobile app)
app.get('/my-orders', (req, res) => {
  const user = getUserFromToken(req);
  if (!user) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  const userOrders = orders.filter(
    (o) => o.user && o.user.id === user.id
  );

  res.json(userOrders);
});

// --- ADMIN ORDER STATUS UPDATE (admin only) ---
app.patch('/admin/orders/:id/status', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body;

  if (!status || !VALID_STATUSES.includes(status)) {
    return res
      .status(400)
      .json({ message: 'Invalid status', valid: VALID_STATUSES });
  }

  const order = orders.find((o) => o.id === id);
  if (!order) {
    return res.status(404).json({ message: 'Order not found' });
  }

  order.status = status;
  saveOrders(orders);

  res.json(order);
});

// existing admin pages (HTML only - JS inside will handle login)
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/admin/products-page', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin_products.html'));
});

app.get('/admin/rep', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin_rep.html'));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log('Server listening on port', PORT);
});
