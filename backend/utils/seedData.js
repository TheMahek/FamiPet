const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Breed = require('../models/Breed');
const Pet = require('../models/Pet');
const Veterinarian = require('../models/Veterinarian');
require('dotenv').config();

const seedData = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/animal_planet');
    console.log('Connected to MongoDB');
    await User.deleteMany();
    await Breed.deleteMany();
    await Pet.deleteMany();
    await Veterinarian.deleteMany();

    const admin = await User.create({ name: 'Admin User', email: 'admin@animalplanet.com', password: 'admin123', role: 'admin', isVerified: true });

    const user = await User.create({ name: 'Demo User', email: 'user@example.com', password: 'user123', role: 'user', isVerified: true });

    const breeds = await Breed.insertMany([
      { name: 'Golden Retriever', species: 'dog', origin: 'Scotland', lifespan: '10-12 years', weightRange: '25-34 kg', heightRange: '51-61 cm', temperament: ['Friendly', 'Intelligent', 'Devoted', 'Gentle'], exerciseRequirements: 'High - needs 1-2 hours daily exercise', groomingGuide: 'Brush 2-3 times per week, daily during shedding', commonDiseases: ['Hip dysplasia', 'Elbow dysplasia', 'Cataracts', 'Heart issues'], suitableEnvironment: 'House with yard, active family', description: 'A friendly, reliable, and trustworthy dog that makes an excellent family pet.' },
      { name: 'Persian Cat', species: 'cat', origin: 'Iran (Persia)', lifespan: '12-17 years', weightRange: '3-6 kg', heightRange: '25-30 cm', temperament: ['Gentle', 'Quiet', 'Affectionate', 'Lazy'], exerciseRequirements: 'Low - indoor play sufficient', groomingGuide: 'Daily brushing required due to long coat', commonDiseases: ['Polycystic kidney disease', 'Respiratory issues', 'Eye conditions'], suitableEnvironment: 'Indoor, calm household', description: 'A luxurious long-haired cat known for its sweet and gentle personality.' },
      { name: 'Labrador Retriever', species: 'dog', origin: 'Canada', lifespan: '10-14 years', weightRange: '25-36 kg', heightRange: '55-62 cm', temperament: ['Outgoing', 'Even tempered', 'Gentle', 'Intelligent'], exerciseRequirements: 'High - very active breed', groomingGuide: 'Weekly brushing, more during shedding season', commonDiseases: ['Hip dysplasia', 'Obesity', 'Ear infections'], suitableEnvironment: 'Active family, house with yard', description: "America's most popular dog breed, known for being friendly and outgoing." },
      { name: 'Siamese Cat', species: 'cat', origin: 'Thailand', lifespan: '15-20 years', weightRange: '3-5 kg', heightRange: '20-25 cm', temperament: ['Vocal', 'Social', 'Intelligent', 'Playful'], exerciseRequirements: 'Moderate - interactive play needed', groomingGuide: 'Weekly brushing, minimal shedding', commonDiseases: ['Respiratory issues', 'Dental problems', 'Amyloidosis'], suitableEnvironment: 'Indoor, social household', description: 'A vocal and social cat that forms strong bonds with its owners.' },
    ]);

    await Pet.insertMany([
      { owner: admin._id, breed: breeds[0]._id, name: 'Buddy', species: 'dog', gender: 'male', age: 2, weight: 30, color: 'Golden', vaccinated: true, adopted: false, status: 'available', description: 'Friendly and energetic Golden Retriever looking for a loving home. Great with kids!', images: ['https://images.unsplash.com/photo-1552053831-71594a27632d?w=400'] },
      { owner: admin._id, breed: breeds[1]._id, name: 'Luna', species: 'cat', gender: 'female', age: 1, weight: 4, color: 'White', vaccinated: true, adopted: false, status: 'available', description: 'Beautiful Persian cat with a calm demeanor. Perfect lap cat!', images: ['https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=400'] },
      { owner: user._id, breed: breeds[2]._id, name: 'Max', species: 'dog', gender: 'male', age: 3, weight: 32, color: 'Chocolate', vaccinated: true, adopted: false, status: 'available', description: 'Loyal and loving Labrador who loves swimming and playing fetch.', images: ['https://images.unsplash.com/photo-1561037404-61cd46aa615b?w=400'] },
    ]);

    await Veterinarian.insertMany([
      { name: 'Dr. Sarah Johnson', email: 'sarah.johnson@vet.com', phone: '+1-555-0101', specialization: ['Small Animals', 'Surgery', 'Dermatology'], qualifications: ['DVM', 'MS Veterinary Surgery'], experience: 12, clinic: 'Paws & Claws Veterinary Clinic', address: '123 Main Street', city: 'New York', rating: 4.8, availability: [{ day: 'Monday', startTime: '09:00', endTime: '17:00', isAvailable: true }, { day: 'Tuesday', startTime: '09:00', endTime: '17:00', isAvailable: true }, { day: 'Wednesday', startTime: '09:00', endTime: '17:00', isAvailable: true }], consultationFee: 75 },
      { name: 'Dr. Michael Chen', email: 'michael.chen@vet.com', phone: '+1-555-0102', specialization: ['Exotic Animals', 'Avian Medicine', 'Internal Medicine'], qualifications: ['DVM', 'PhD Avian Medicine'], experience: 8, clinic: 'Exotic Pet Care Center', address: '456 Oak Avenue', city: 'Los Angeles', rating: 4.9, availability: [{ day: 'Monday', startTime: '10:00', endTime: '18:00', isAvailable: true }, { day: 'Thursday', startTime: '10:00', endTime: '18:00', isAvailable: true }, { day: 'Friday', startTime: '10:00', endTime: '18:00', isAvailable: true }], consultationFee: 90 },
    ]);

    console.log('Seed data created successfully!');
    console.log('Admin: admin@animalplanet.com / admin123');
    console.log('User: user@example.com / user123');
    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
};

seedData();
