const Product = require('../models/Product');
const Category = require('../models/Category');
const { uploadToS3, deleteFromS3, extractS3Key } = require('../utils/s3Upload');

// @desc    Get all products with filters
// @route   GET /api/products
// @access  Public
exports.getProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;

    // Build query
    let query = { isActive: true };

    // Search
    if (req.query.search) {
      query.$text = { $search: req.query.search };
    }

    // Category filter
    if (req.query.category) {
      query.category = req.query.category;
    }

    // Fabric filter
    if (req.query.fabric) {
      query.fabric = req.query.fabric;
    }

    // Price filter
    if (req.query.minPrice || req.query.maxPrice) {
      query.price = {};
      if (req.query.minPrice) query.price.$gte = parseFloat(req.query.minPrice);
      if (req.query.maxPrice) query.price.$lte = parseFloat(req.query.maxPrice);
    }

    // Size filter
    if (req.query.size) {
      query.sizes = req.query.size;
    }

    // Featured filter
    if (req.query.featured === 'true') {
      query.isFeatured = true;
    }

    // In stock filter
    if (req.query.inStock === 'true') {
      query.stock = { $gt: 0 };
    }

    // Sort options
    let sortOption = {};
    switch (req.query.sort) {
      case 'price-asc':
        sortOption = { price: 1 };
        break;
      case 'price-desc':
        sortOption = { price: -1 };
        break;
      case 'newest':
        sortOption = { createdAt: -1 };
        break;
      case 'rating':
        sortOption = { averageRating: -1 };
        break;
      case 'popular':
        sortOption = { sold: -1 };
        break;
      default:
        sortOption = { createdAt: -1 };
    }

    const products = await Product.find(query)
      .populate('category', 'name slug')
      .sort(sortOption)
      .limit(limit)
      .skip(skip);

    const total = await Product.countDocuments(query);

    res.status(200).json({
      success: true,
      count: products.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      products
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get single product
// @route   GET /api/products/:id
// @access  Public
exports.getProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('category', 'name slug')
      .populate('reviews.user', 'name');

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.status(200).json({
      success: true,
      product
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Create product
// @route   POST /api/products
// @access  Private/Admin
exports.createProduct = async (req, res) => {
  try {
    console.log('Creating product with data:', req.body);
    console.log('Uploaded files:', req.files);

    // --------------------------------------------------
    // PARSE BASIC FIELDS
    // --------------------------------------------------

    const price = parseFloat(req.body.price);

    if (isNaN(price)) {
      return res.status(400).json({
        success: false,
        message: 'Valid product price is required'
      });
    }

    const stock = req.body.stock
      ? parseInt(req.body.stock, 10)
      : 0;

    if (isNaN(stock) || stock < 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid stock quantity is required'
      });
    }

    // --------------------------------------------------
    // PARSE TAGS
    // --------------------------------------------------

    let tags = [];

    if (req.body.tags) {
      try {
        tags =
          typeof req.body.tags === 'string'
            ? JSON.parse(req.body.tags)
            : req.body.tags;

        if (!Array.isArray(tags)) {
          tags = [];
        }
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: 'Invalid tags format'
        });
      }
    }

    // --------------------------------------------------
    // PARSE SPECIFICATIONS
    // --------------------------------------------------

    let specifications = {};

    if (req.body.specifications) {
      try {
        specifications =
          typeof req.body.specifications === 'string'
            ? JSON.parse(req.body.specifications)
            : req.body.specifications;
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: 'Invalid specifications format'
        });
      }
    }

    // --------------------------------------------------
    // HANDLE DIRECT SPECIFICATION FIELDS
    // Useful if frontend sends them individually
    // --------------------------------------------------

    const specificationFields = [
      'material',
      'weight',
      'dimensions',
      'color',
      'countryOfOrigin',
      'ingredients',
      'benefits',
      'usage',
      'expiryDate',
      'manufacturingDate',
      'nutritionalInfo',
      'storageInstructions',
      'vegNonVeg',
      'dosage',
      'precautions',
      'warranty'
    ];

    specificationFields.forEach((field) => {
      if (
        req.body[field] !== undefined &&
        req.body[field] !== ''
      ) {
        specifications[field] = req.body[field];
      }
    });

    // --------------------------------------------------
    // BUILD PRODUCT DATA
    // --------------------------------------------------

    const productData = {
      name: req.body.name?.trim(),
      description: req.body.description?.trim(),

      price,

      discountPrice:
        req.body.discountPrice !== undefined &&
        req.body.discountPrice !== ''
          ? parseFloat(req.body.discountPrice)
          : undefined,

      category: req.body.category,

      brand: req.body.brand?.trim(),

      sku: req.body.sku?.trim(),

      stock,

      unit: req.body.unit?.trim(),

      tags,

      specifications,

      isFeatured:
        req.body.isFeatured === true ||
        req.body.isFeatured === 'true',

      isActive:
        req.body.isActive === undefined
          ? true
          : req.body.isActive === true ||
            req.body.isActive === 'true',

      mainImageIndex:
        req.body.mainImageIndex !== undefined
          ? parseInt(req.body.mainImageIndex, 10)
          : 0
    };

    // --------------------------------------------------
    // VALIDATE DISCOUNT PRICE
    // --------------------------------------------------

    if (
      productData.discountPrice !== undefined &&
      (
        isNaN(productData.discountPrice) ||
        productData.discountPrice < 0
      )
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid discount price'
      });
    }

    if (
      productData.discountPrice !== undefined &&
      productData.discountPrice > productData.price
    ) {
      return res.status(400).json({
        success: false,
        message: 'Discount price cannot be greater than product price'
      });
    }

    // --------------------------------------------------
    // UPLOAD IMAGES TO S3
    // --------------------------------------------------

    if (req.files && req.files.length > 0) {
      const uploadPromises = req.files.map(
        async (file, index) => {
          const uploadResult = await uploadToS3(file);

          return {
            url: uploadResult.url,
            key: uploadResult.key,
            alt: `${productData.name} - Image ${index + 1}`
          };
        }
      );

      productData.images = await Promise.all(uploadPromises);
    } else {
      productData.images = [];
    }

    // --------------------------------------------------
    // VALIDATE MAIN IMAGE INDEX
    // --------------------------------------------------

    if (
      productData.images.length > 0 &&
      productData.mainImageIndex >= productData.images.length
    ) {
      productData.mainImageIndex = 0;
    }

    // --------------------------------------------------
    // CREATE PRODUCT
    // --------------------------------------------------

    const product = await Product.create(productData);

    return res.status(201).json({
      success: true,
      message: 'Product created successfully',
      product
    });

  } catch (error) {
    console.error('Error creating product:', error);

    // --------------------------------------------------
    // MONGOOSE VALIDATION ERROR
    // --------------------------------------------------

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(
        (err) => err.message
      );

      return res.status(400).json({
        success: false,
        message: 'Validation Error',
        errors
      });
    }

    // --------------------------------------------------
    // DUPLICATE KEY ERROR
    // --------------------------------------------------

    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0];

      return res.status(400).json({
        success: false,
        message: `${field || 'Product'} already exists`
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Error creating product',
      error: error.message
    });
  }
};

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Private/Admin
exports.updateProduct = async (req, res) => {
  try {
    let product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    console.log('Updating product with data:', req.body);
    console.log('Uploaded files:', req.files);

    // Parse the update data
    const updateData = { ...req.body };

    // Parse JSON fields if they exist
    if (updateData.colors && typeof updateData.colors === 'string') {
      updateData.colors = JSON.parse(updateData.colors);
    }
    if (updateData.sizes && typeof updateData.sizes === 'string') {
      updateData.sizes = JSON.parse(updateData.sizes);
    }

    // Handle existing images from request
    let existingImages = [];
    if (req.body.existingImages) {
      existingImages = typeof req.body.existingImages === 'string'
        ? JSON.parse(req.body.existingImages)
        : req.body.existingImages;
    }

    // Find images to delete (images in DB but not in existingImages)
    const imagesToDelete = product.images.filter(
      img => !existingImages.some(existing => existing.url === img.url)
    );

    // Delete removed images from S3
    if (imagesToDelete.length > 0) {
      const deletePromises = imagesToDelete.map(async (img) => {
        const key = extractS3Key(img.url);
        if (key) {
          try {
            await deleteFromS3(key);
            console.log(`Deleted image from S3: ${key}`);
          } catch (error) {
            console.error(`Error deleting image from S3: ${key}`, error);
          }
        }
      });
      await Promise.all(deletePromises);
    }

    // Upload new images to S3
    let newImages = [];
    if (req.files && req.files.length > 0) {
      const uploadPromises = req.files.map(async (file, index) => {
        const uploadResult = await uploadToS3(file);
        return {
          url: uploadResult.url,
          key: uploadResult.key,
          alt: `${updateData.name || product.name} - Image ${existingImages.length + index + 1}`
        };
      });
      newImages = await Promise.all(uploadPromises);
    }

    // Combine existing and new images
    updateData.images = [...existingImages, ...newImages];

    // Update the product
    product = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      {
        new: true,
        runValidators: true
      }
    );

    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      product
    });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Delete product
// @route   DELETE /api/products/:id
// @access  Private/Admin
exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Delete all product images from S3
    if (product.images && product.images.length > 0) {
      const deletePromises = product.images.map(async (img) => {
        const key = extractS3Key(img.url);
        if (key) {
          try {
            await deleteFromS3(key);
            console.log(`Deleted image from S3: ${key}`);
          } catch (error) {
            console.error(`Error deleting image from S3: ${key}`, error);
          }
        }
      });
      await Promise.all(deletePromises);
    }

    await product.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Add product review
// @route   POST /api/products/:id/reviews
// @access  Private
exports.addReview = async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check if user already reviewed
    const alreadyReviewed = product.reviews.find(
      review => review.user.toString() === req.user.id
    );

    if (alreadyReviewed) {
      return res.status(400).json({
        success: false,
        message: 'You have already reviewed this product'
      });
    }

    const review = {
      user: req.user.id,
      name: req.user.name,
      rating: Number(rating),
      comment
    };

    product.reviews.push(review);
    product.calculateAverageRating();

    await product.save();

    res.status(201).json({
      success: true,
      message: 'Review added successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get related products
// @route   GET /api/products/:id/related
// @access  Public
exports.getRelatedProducts = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const relatedProducts = await Product.find({
      _id: { $ne: product._id },
      category: product.category,
      isActive: true
    })
      .limit(4)
      .select('name price discountPrice images averageRating slug');

    res.status(200).json({
      success: true,
      products: relatedProducts
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
