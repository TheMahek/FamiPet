const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { getAllUsers, getUserById, toggleFavorite, uploadAvatar } = require('../controllers/user.controller');
const upload = require('../middleware/upload');

router.get('/', protect, getAllUsers);
router.get('/:id', getUserById);
router.post('/favorites/:petId', protect, toggleFavorite);
router.post('/avatar', protect, upload.single('avatar'), uploadAvatar);

module.exports = router;
