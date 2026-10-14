    const express = require('express');
    const nodemailer = require('nodemailer');
    const multer = require('multer');
    const mongoose = require('mongoose');
    const session = require('express-session');
    const path = require('path');
    const fs = require('fs');
    const app = express();
    const port = process.env.PORT || 3000

    require('dotenv').config({
        path: require('path').join(__dirname, '.env')
    });

    const ADMIN_USERNAME = (process.env.ADMIN_USERNAME || '').trim();
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';




    const viewsPath = path.join(__dirname, 'views');
    const imagesPath = path.join(viewsPath, 'images');

    app.set('view engine', 'ejs');
    app.set('views', viewsPath);


    fs.mkdirSync(imagesPath, { recursive: true });


    app.use(express.static(viewsPath));

    app.use(express.urlencoded({ extended: true }));

    app.set('trust proxy', 1);

    app.use(session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: process.env.NODE_ENV === 'production',
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000
        }
    }));


    app.use((req, res, next) => {
        res.locals.isAdmin = Boolean(req.session.isAdmin);

        const cart = req.session.cart || {};
        res.locals.cartCount = Object.values(cart)
            .reduce((total, quantity) => total + quantity, 0);

        next();
    });



    const storage = multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, imagesPath);
        },
        filename: (req, file, cb) => {
            const safeName = file.originalname.replace(
                /[^a-zA-Z0-9._-]/g,
                '_'
            );

            cb(null, Date.now() + '-' + safeName);
        }
    });

    const upload = multer({
        storage,
        limits: {
            fileSize: 5 * 1024 * 1024
        },
        fileFilter: (req, file, cb) => {
            if (file.mimetype.startsWith('image/')) {
                return cb(null, true);
            }

            cb(new Error('Only image files are allowed'));
        }
    });

    // Mongodb

    // mongoose.connect('')
    mongoose.connect(process.env.MONGODB_URI)
        .then(() => console.log("MongoDB connected"))
        .catch((err) => console.error("MongoDB connection error:", err.message));


    const bookSchema = new mongoose.Schema({
        title: String,
        authorName: String,
        category: String,
        price: Number,
        image: String
    });

    const Book = mongoose.model('Book', bookSchema);



    const orderSchema = new mongoose.Schema({
        bookId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Book',
            required: true
        },
        bookTitle: {
            type: String,
            required: true
        },
        price: {
            type: Number,
            required: true
        },
        customerName: {
            type: String,
            required: true
        },
        mobile: {
            type: String,
            required: true
        },
        address: {
            type: String,
            required: true
        },
        city: {
            type: String,
            required: true
        },
        pincode: {
            type: String,
            required: true
        },
        paymentMethod: {
            type: String,
            default: 'COD'
        },
        status: {
            type: String,
            default: 'Pending'
        }
    }, {
        timestamps: true
    });

    const Order = mongoose.model('Order', orderSchema);


    function isAdmin(req, res, next) {
        if (req.session.isAdmin) {
            return next();
        }

        res.redirect('/admin/login');
    }


    app.get('/admin/login', (req, res) => {
      if (req.session.isAdmin) {
    return res.redirect('/books');
}

        res.render('adminlogin', {
            error: null
        });
    });

    app.post('/admin/login', (req, res) => {
        const username = (req.body.username || '').trim();
        const password = req.body.password || '';

        console.log('Admin username loaded:', JSON.stringify(ADMIN_USERNAME));
        console.log('Username entered:', JSON.stringify(username));

        if (username !== ADMIN_USERNAME) {
            return res.status(401).render('adminlogin', {
                error: 'Invalid username.'
            });
        }

        if (password !== ADMIN_PASSWORD) {
            return res.status(401).render('adminlogin', {
                error: 'Incorrect password. Please try again.'
            });
        }

        req.session.isAdmin = true;

        req.session.save(err => {
            if (err) {
                console.log(err);
                return res.status(500).send('Login failed');
            }

            res.redirect('/books');
        });
    });

    app.get('/admin/logout', (req, res) => {
        req.session.destroy(err => {
            if (err) {
                console.log(err);
                return res.status(500).send('Logout failed');
            }

            res.redirect('/');
        });
    });


    app.get('/', async (req, res) => {
        try {
            const books = await Book.find()
                .sort({ _id: -1 })
                .limit(8);

            res.render('home', { books });
        } catch (err) {
            console.log(err);
            res.status(500).send('Unable to load home page');
        }
    });



    
app.get('/books', async (req, res) => {
    try {
        const books = await Book.find().sort({ _id: -1 });

        res.render('books', {
            books,
            isAdmin: req.session.isAdmin === true
        });
    } catch (err) {
        console.log(err);
        res.status(500).send('Unable to load books');
    }
});




    app.get('/books/manage', isAdmin, async (req, res) => {
        try {
            const books = await Book.find().sort({ _id: -1 });

            res.render('editbook', {
                books,
                mode: 'manage'
            });
        } catch (err) {
            console.log(err);
            res.status(500).send('Unable to load book management');
        }
    });



    app.post('/books/new', isAdmin, upload.single('img'), async (req, res) => {
        try {
            const { title, authorName, category, price } = req.body;

            if (
                !title?.trim() ||
                !authorName?.trim() ||
                !category?.trim() ||
                price === ''
            ) {
                return res.status(400).send('Please fill all book details');
            }

            const bookPrice = Number(price);

            if (!Number.isFinite(bookPrice) || bookPrice < 0) {
                return res.status(400).send('Please enter a valid price');
            }

            await Book.create({
                title: title.trim(),
                authorName: authorName.trim(),
                category: category.trim(),
                price: bookPrice,
                image: req.file ? req.file.filename : ''
            });

            res.redirect('/books/manage');
        } catch (err) {
            console.log(err);
            res.status(500).send('Unable to add book');
        }
    });



    app.post('/books/delete/:id', isAdmin, async (req, res) => {
        try {
            if (!mongoose.isValidObjectId(req.params.id)) {
                return res.status(400).send('Invalid book ID');
            }

            const book = await Book.findByIdAndDelete(req.params.id);

            if (book?.image) {
                const filename = path.basename(book.image);
                const imageFile = path.join(imagesPath, filename);

                if (fs.existsSync(imageFile)) {
                    fs.unlinkSync(imageFile);
                }
            }

            res.redirect('/books/manage');
        } catch (err) {
            console.log(err);
            res.status(500).send('Unable to delete book');
        }
    });



    app.get('/books/edit/:id', isAdmin, async (req, res) => {
        try {
            if (!mongoose.isValidObjectId(req.params.id)) {
                return res.status(400).send('Invalid book ID');
            }

            const book = await Book.findById(req.params.id);

            if (!book) {
                return res.status(404).send('Book not found');
            }

            const books = await Book.find().sort({ _id: -1 });

            res.render('editbook', {
                books,
                book,
                mode: 'edit'
            });
        } catch (err) {
            console.log(err);
            res.status(500).send('Unable to open edit page');
        }
    });


    app.post('/books/edit/:id', isAdmin, upload.single('img'), async (req, res) => {
        try {
            if (!mongoose.isValidObjectId(req.params.id)) {
                return res.status(400).send('Invalid book ID');
            }

            const { title, authorName, category, price } = req.body;
            const bookPrice = Number(price);

            if (
                !title?.trim() ||
                !authorName?.trim() ||
                !category?.trim() ||
                price === '' ||
                !Number.isFinite(bookPrice) ||
                bookPrice < 0
            ) {
                return res.status(400).send('Please enter valid book details');
            }

            const updates = {
                title: title.trim(),
                authorName: authorName.trim(),
                category: category.trim(),
                price: bookPrice
            };

            if (req.file) {
                updates.image = req.file.filename;
            }

            const book = await Book.findByIdAndUpdate(
                req.params.id,
                updates,
                { returnDocument: 'after', runValidators: true }
            );

            if (!book) {
                return res.status(404).send('Book not found');
            }

            res.redirect('/books/manage');
        } catch (err) {
            console.log(err);
            res.status(500).send('Unable to update book');
        }
    });



    app.get('/buy-now/:id', async (req, res) => {
        try {
            if (!mongoose.isValidObjectId(req.params.id)) {
                return res.status(400).send('Invalid book ID');
            }

            const book = await Book.findById(req.params.id);

            if (!book) {
                return res.status(404).send('Book not found');
            }

            res.render('checkout', { book });
        } catch (err) {
            console.log(err);
            res.status(500).send('Unable to open checkout page');
        }
    });


    // Add book to cart
    app.post('/cart/add', async (req, res) => {
        try {
            const { bookId } = req.body;

            if (!mongoose.isValidObjectId(bookId)) {
                return res.status(400).send('Invalid book ID');
            }

            const book = await Book.findById(bookId);

            if (!book) {
                return res.status(404).send('Book not found');
            }

            if (!req.session.cart) {
                req.session.cart = {};
            }

            const currentQty = req.session.cart[bookId] || 0;
            req.session.cart[bookId] = currentQty + 1;

            req.session.save(err => {
                if (err) {
                    console.log(err);
                    return res.status(500).send('Unable to add book to cart');
                }

                res.redirect(req.get('referer') || '/books');
            });
        } catch (err) {
            console.log(err);
            res.status(500).send('Unable to add book to cart');
        }
    });

    // Display cart
    app.get('/cart', async (req, res) => {
        try {
            const cart = req.session.cart || {};
            const cartItems = [];
            let total = 0;

            for (const [bookId, quantity] of Object.entries(cart)) {
                if (!mongoose.isValidObjectId(bookId)) continue;

                const book = await Book.findById(bookId);

                if (!book) continue;

                cartItems.push({ book, quantity });
                total += book.price * quantity;
            }

            res.render('cart', { cartItems, total });
        } catch (err) {
            console.log(err);
            res.status(500).send('Unable to load cart');
        }
    });

    // Update quantity
    app.post('/cart/update/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const quantity = Number(req.body.quantity);

            if (!mongoose.isValidObjectId(id)) {
                return res.status(400).send('Invalid book ID');
            }

            if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
                return res.status(400).send('Quantity must be between 1 and 99');
            }

            const book = await Book.findById(id);

            if (!book) {
                return res.status(404).send('Book not found');
            }

            if (!req.session.cart || !req.session.cart[id]) {
                return res.redirect('/cart');
            }

            req.session.cart[id] = quantity;
            res.redirect('/cart');
        } catch (err) {
            console.log(err);
            res.status(500).send('Unable to update quantity');
        }
    });


    app.post('/cart/remove/:id', (req, res) => {
        if (req.session.cart) {
            delete req.session.cart[req.params.id];
        }

        res.redirect('/cart');
    });


    app.get('/cart/checkout', async (req, res) => {
        try {
            const cart = req.session.cart || {};
            const cartItems = [];
            let total = 0;

            for (const [bookId, quantity] of Object.entries(cart)) {
                if (!mongoose.isValidObjectId(bookId)) continue;

                const book = await Book.findById(bookId);

                if (book) {
                    cartItems.push({ book, quantity });
                    total += book.price * quantity;
                }
            }

            if (!cartItems.length) {
                return res.redirect('/cart');
            }

            res.render('cart', { cartItems, total, checkoutMode: true });
        } catch (err) {
            console.log(err);
            res.status(500).send('Unable to open cart checkout');
        }
    });


    app.post('/cart/checkout', async (req, res) => {
        try {
            const {
                customerName, mobile, address, city, pincode
            } = req.body;

            if (
                !customerName?.trim() ||
                !mobile?.trim() ||
                !address?.trim() ||
                !city?.trim() ||
                !pincode?.trim()
            ) {
                return res.status(400).send('Please fill all delivery details');
            }

            if (!/^[0-9]{10}$/.test(mobile.trim())) {
                return res.status(400).send('Enter a valid 10-digit mobile number');
            }

            if (!/^[0-9]{6}$/.test(pincode.trim())) {
                return res.status(400).send('Enter a valid 6-digit PIN code');
            }

            const cart = req.session.cart || {};
            const orders = [];

            for (const [bookId, quantity] of Object.entries(cart)) {
                if (!mongoose.isValidObjectId(bookId)) continue;

                const book = await Book.findById(bookId);

                if (!book) continue;

                for (let i = 0; i < quantity; i++) {
                    const order = await Order.create({
                        bookId: book._id,
                        bookTitle: book.title,
                        price: book.price,
                        customerName: customerName.trim(),
                        mobile: mobile.trim(),
                        address: address.trim(),
                        city: city.trim(),
                        pincode: pincode.trim(),
                        paymentMethod: 'COD',
                        status: 'Pending'
                    });

                    orders.push(order);
                }
            }

            if (!orders.length) {
                return res.redirect('/cart');
            }

            req.session.cart = {};

            req.session.save(err => {
                if (err) {
                    console.log(err);
                    return res.status(500).send('Order placed, but cart could not be cleared');
                }

                res.render('cart-success', { orders });
            });
        } catch (err) {
            console.log(err);
            res.status(500).send('Unable to place cart order');
        }
    });


    app.post('/orders/new', async (req, res) => {
        try {
            const {
                bookId,
                customerName,
                mobile,
                address,
                city,
                pincode
            } = req.body;

            if (
                !mongoose.isValidObjectId(bookId) ||
                !customerName?.trim() ||
                !mobile?.trim() ||
                !address?.trim() ||
                !city?.trim() ||
                !pincode?.trim()
            ) {
                return res.status(400).send('Please fill all delivery details');
            }

            if (!/^[0-9]{10}$/.test(mobile.trim())) {
                return res.status(400).send('Enter a valid 10-digit mobile number');
            }

            if (!/^[0-9]{6}$/.test(pincode.trim())) {
                return res.status(400).send('Enter a valid 6-digit PIN code');
            }

            const book = await Book.findById(bookId);

            if (!book) {
                return res.status(404).send('Book not found');
            }

            const order = await Order.create({
                bookId: book._id,
                bookTitle: book.title,
                price: book.price,
                customerName: customerName.trim(),
                mobile: mobile.trim(),
                address: address.trim(),
                city: city.trim(),
                pincode: pincode.trim(),
                paymentMethod: 'COD',
                status: 'Pending'
            });

            res.render('order-success', { order });
        } catch (err) {
            console.log(err);
            res.status(500).send('Unable to place order');
        }
    });



    app.get('/admin/orders', isAdmin, async (req, res) => {
        try {
            const orders = await Order.find().sort({ createdAt: -1 });

            res.render('adminorders', { orders });
        } catch (err) {
            console.log(err);
            res.status(500).send('Unable to load orders');
        }
    });



    app.post('/admin/orders/:id/status', isAdmin, async (req, res) => {
        try {
            if (!mongoose.isValidObjectId(req.params.id)) {
                return res.status(400).send('Invalid order ID');
            }

            const allowedStatuses = [
                'Pending',
                'Confirmed',
                'Shipped',
                'Delivered',
                'Cancelled'
            ];

            const { status } = req.body;

            if (!allowedStatuses.includes(status)) {
                return res.status(400).send('Invalid order status');
            }

            const order = await Order.findByIdAndUpdate(
                req.params.id,
                { status },
                { returnDocument: 'after' }
            );

            if (!order) {
                return res.status(404).send('Order not found');
            }

            res.redirect('/admin/orders');
        } catch (err) {
            console.log(err);
            res.status(500).send('Unable to update order status');
        }
    });



    app.get('/category', async (req, res) => {
        try {
            const books = await Book.find().sort({ _id: -1 });
            const categories = await Book.distinct('category');

            res.render('categories', {
                books,
                categories,
                selectedCategory: ''
            });
        } catch (err) {
            console.log(err);
            res.status(500).send('Unable to load categories');
        }
    });

   
app.get('/category/:category', async (req, res) => {
    try {
        const selectedCategory = req.params.category.trim();

        // Allow "Self Help", "Self-Help" and "SelfHelp"
        const categoryParts = selectedCategory
            .split(/[\s-]+/)
            .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

        const categoryPattern = '^' + categoryParts.join('[\\s-]*') + '$';

        const books = await Book.find({
            category: {
                $regex: categoryPattern,
                $options: 'i'
            }
        }).sort({ _id: -1 });

        const categories = await Book.distinct('category');

        res.render('categories', {
            books,
            categories,
            selectedCategory,
            isAdmin: req.session.isAdmin === true
        });
    } catch (err) {
        console.log(err);
        res.status(500).send('Unable to load selected category');
    }
});

    app.get('/about', (req, res) => {
        res.render('about');
    });
    const EMAIL_USER = process.env.EMAIL_USER;
    const EMAIL_PASS = process.env.EMAIL_PASS;
    const CONTACT_EMAIL = process.env.CONTACT_EMAIL;


 
const transport = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 20000
});



    app.get('/contact', (req, res) => {
        res.render('contact', {
            message: null,
            error: null
        });
    });

    app.post('/contact', async (req, res) => {
        try {
            const { name, email, subject, message } = req.body;

            if (
                !name?.trim() ||
                !email?.trim() ||
                !message?.trim()
            ) {
                return res.status(400).render('contact', {
                    message: null,
                    error: 'Please fill in all required fields.'
                });
            }

            if (!EMAIL_USER || !EMAIL_PASS || !CONTACT_EMAIL) {
                return res.status(503).render('contact', {
                    message: null,
                    error: 'Email is not configured yet. Please try again later.'
                });
            }
            console.log("Contact route reached. Email configured:", Boolean(EMAIL_USER && EMAIL_PASS && CONTACT_EMAIL));

                        console.log('Starting to send contact email...');
            await transport.sendMail({
                from: EMAIL_USER,
                to: CONTACT_EMAIL,
                replyTo: email.trim(),
                subject: subject?.trim() || 'New message from Read Me Book Store',
                text:
                    'Name: ' + name.trim() + '\n' +
                    'Email: ' + email.trim() + '\n\n' +
                    message.trim()
            });
            console.log('Contact email sent successfully!');

            res.render('contact', {
                message: 'Your message has been sent successfully!',
                error: null
            });
        } catch (err) {
            console.log('Contact email error:', err);

            res.status(500).render('contact', {
                message: null,
                error: 'Unable to send your message right now.'
            });
        }
    });



    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });