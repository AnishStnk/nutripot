const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  comment: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const productSchema = new mongoose.Schema(
  {
    // --------------------------------------------------
    // BASIC PRODUCT INFORMATION
    // --------------------------------------------------
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true
    },

    slug: {
      type: String,
      unique: true,
      lowercase: true,
      index: true
    },

    description: {
      type: String,
      required: [true, 'Product description is required'],
      trim: true
    },

    brand: {
      type: String,
      trim: true
    },

    sku: {
      type: String,
      trim: true,
      unique: true,
      sparse: true
    },

    // --------------------------------------------------
    // PRICE
    // --------------------------------------------------
    price: {
      type: Number,
      required: [true, 'Product price is required'],
      min: 0
    },

    discountPrice: {
      type: Number,
      min: 0
    },

    // --------------------------------------------------
    // CATEGORY
    // --------------------------------------------------
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Product category is required']
    },

    // --------------------------------------------------
    // INVENTORY
    // --------------------------------------------------
    stock: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },

    unit: {
      type: String,
      trim: true
      // Examples:
      // kg, g, litre, ml, piece, pack, box, set
    },

    // --------------------------------------------------
    // IMAGES
    // --------------------------------------------------
    images: [
      {
        url: {
          type: String,
          required: true
        },
        alt: {
          type: String
        },
        key: {
          type: String
        }
      }
    ],

    mainImageIndex: {
      type: Number,
      default: 0,
      min: 0
    },

    // --------------------------------------------------
    // PRODUCT STATUS
    // --------------------------------------------------
    isFeatured: {
      type: Boolean,
      default: false
    },

    isActive: {
      type: Boolean,
      default: true
    },

    // --------------------------------------------------
    // SEARCH / FILTERING
    // --------------------------------------------------
    tags: [
      {
        type: String,
        trim: true
      }
    ],

    // --------------------------------------------------
    // PRODUCT DETAILS
    // This can contain category-specific information
    // --------------------------------------------------
    specifications: {
      // Common
      material: String,
      weight: String,
      dimensions: String,
      color: String,
      countryOfOrigin: String,

      // Food / Herbal
      ingredients: String,
      benefits: String,
      usage: String,
      expiryDate: Date,
      manufacturingDate: Date,

      // Food
      nutritionalInfo: String,
      storageInstructions: String,
      vegNonVeg: {
        type: String,
        enum: ['Veg', 'Non-Veg', 'Not Applicable']
      },

      // Herbal
      dosage: String,
      precautions: String,

      // Kitchen Tools
      warranty: String,

      // Flexible additional information
      additionalInfo: {
        type: Map,
        of: mongoose.Schema.Types.Mixed
      }
    },

    // --------------------------------------------------
    // REVIEWS
    // --------------------------------------------------
    reviews: [reviewSchema],

    numReviews: {
      type: Number,
      default: 0
    },

    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },

    // --------------------------------------------------
    // SALES
    // --------------------------------------------------
    sold: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  {
    timestamps: true
  }
);

// --------------------------------------------------
// GENERATE SLUG
// --------------------------------------------------
productSchema.pre('save', function (next) {
  if (this.isModified('name')) {
    this.slug = this.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  next();
});

// --------------------------------------------------
// CALCULATE AVERAGE RATING
// --------------------------------------------------
productSchema.methods.calculateAverageRating = function () {
  if (!this.reviews || this.reviews.length === 0) {
    this.averageRating = 0;
    this.numReviews = 0;
    return;
  }

  const sum = this.reviews.reduce(
    (acc, review) => acc + review.rating,
    0
  );

  this.averageRating = Number(
    (sum / this.reviews.length).toFixed(1)
  );

  this.numReviews = this.reviews.length;
};

// --------------------------------------------------
// INDEXES
// --------------------------------------------------
productSchema.index({
  name: 'text',
  description: 'text',
  tags: 'text',
  brand: 'text'
});

productSchema.index({ category: 1 });
productSchema.index({ price: 1 });
productSchema.index({ createdAt: -1 });
productSchema.index({ averageRating: -1 });
productSchema.index({ isActive: 1 });
productSchema.index({ isFeatured: 1 });

module.exports = mongoose.model('Product', productSchema);
