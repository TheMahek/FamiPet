const multer = require('multer');

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  console.error(err);

  if (err.name === 'CastError') {
    error.message = 'Resource not found';
    return res.status(404).json({ success: false, message: error.message });
  }
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ success: false, message: 'Image file is too large. Maximum size is 5 MB.' });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ success: false, message: 'Unexpected file field.' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ success: false, message: 'Too many files uploaded.' });
    }
    return res.status(400).json({ success: false, message: 'Upload rejected.' });
  }
  if (err.code === 11000) {
    error.message = 'Duplicate field value entered';
    return res.status(400).json({ success: false, message: error.message });
  }
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(val => val.message);
    return res.status(400).json({ success: false, message: messages.join(', ') });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'Payload too large' });
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const statusCode = err.status || 500;

  res.status(statusCode).json({
    success: false,
    message: isProduction ? 'Internal server error' : error.message || 'Server Error',
  });
};

module.exports = errorHandler;
