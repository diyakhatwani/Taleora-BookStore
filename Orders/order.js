const mongoose = require('mongoose');

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

module.exports = mongoose.model('Order', orderSchema);
