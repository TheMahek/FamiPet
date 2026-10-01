const mongoose = require('mongoose');
const User = require('../models/User');
const Breed = require('../models/Breed');
const Pet = require('../models/Pet');
const Veterinarian = require('../models/Veterinarian');
const CommunityPost = require('../models/CommunityPost');
const LostFound = require('../models/LostFound');
const Appointment = require('../models/Appointment');
const Reminder = require('../models/Reminder');
const HealthRecord = require('../models/HealthRecord');
const Vaccination = require('../models/Vaccination');
const Adoption = require('../models/Adoption');
const Notification = require('../models/Notification');
require('dotenv').config();
const logger = require('./logger');

const seedData = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/animal_planet');
    logger.info('Connected to MongoDB');

    await Promise.all([
      User.deleteMany(),
      Breed.deleteMany(),
      Pet.deleteMany(),
      Veterinarian.deleteMany(),
      CommunityPost.deleteMany(),
      LostFound.deleteMany(),
      Appointment.deleteMany(),
      Reminder.deleteMany(),
      HealthRecord.deleteMany(),
      Vaccination.deleteMany(),
      Adoption.deleteMany(),
      Notification.deleteMany(),
    ]);

    // Seeded accounts get no avatar: the client renders its own generic
    // placeholder (pink initials in the sidebar, avatar-generic.svg elsewhere),
    // and a bundled asset path must never be stored as a user's avatar.
    // Passwords are throwaway demo credentials and all end in "famipet".
    // User.create() (not insertMany) is required: User.js pre("save") hashes
    // the password, and insertMany skips save hooks.
    const ADMIN_PW = 'adminfamipet';
    const USER_PW = 'userfamipet';

    const [admin, admin2, admin3, user, user2, user3, user4] = await Promise.all([
      User.create({ name: 'Admin User', email: 'admin@famipet.in', password: ADMIN_PW, role: 'admin', isVerified: true }),
      User.create({ name: 'Sara Ahmed', email: 'sara@famipet.in', password: ADMIN_PW, role: 'admin', isVerified: true }),
      User.create({ name: 'Marcus Lee', email: 'marcus@famipet.in', password: ADMIN_PW, role: 'admin', isVerified: true }),
      User.create({ name: 'Demo User', email: 'user@famipet.in', password: USER_PW, role: 'user', isVerified: true }),
      User.create({ name: 'Priya Sharma', email: 'priya@famipet.in', password: USER_PW, role: 'user', isVerified: true }),
      User.create({ name: 'Daniel Okafor', email: 'daniel@famipet.in', password: USER_PW, role: 'user', isVerified: true }),
      User.create({ name: 'Emily Novak', email: 'emily@famipet.in', password: USER_PW, role: 'user', isVerified: true }),
    ]);

    // One representative photo per curated breed, keyed by breed name.
    // Wikimedia Commons originals: freely licensed, stable URLs, and every
    // entry below was checked to still serve an image. Without these the
    // gallery falls back to one generic dog/cat/bird asset per species
    // (breedsBase.ts breedImage), so every card looks identical.
    const BREED_IMAGES = {
      'Golden Retriever': 'https://upload.wikimedia.org/wikipedia/commons/b/bd/Golden_Retriever_Dukedestiny01_drvd.jpg',
      'Persian Cat': 'https://upload.wikimedia.org/wikipedia/commons/8/81/Persialainen.jpg',
      'Labrador Retriever': 'https://upload.wikimedia.org/wikipedia/commons/3/34/Labrador_on_Quantock_%282175262184%29.jpg',
      'Siamese Cat': 'https://upload.wikimedia.org/wikipedia/commons/1/16/Siamese_cat_Vaillante.JPG',
      'Beagle': 'https://upload.wikimedia.org/wikipedia/commons/5/55/Beagle_600.jpg',
      'German Shepherd': 'https://upload.wikimedia.org/wikipedia/commons/d/d0/German_Shepherd_-_DSC_0346_%2810096362833%29.jpg',
      'Pomeranian': 'https://upload.wikimedia.org/wikipedia/commons/c/ca/Pomeranian.JPG',
      'Rottweiler': 'https://upload.wikimedia.org/wikipedia/commons/2/26/Rottweiler_standing_facing_left.jpg',
      'Siberian Husky': 'https://upload.wikimedia.org/wikipedia/commons/8/8b/Husky_L.jpg',
      'Domestic Shorthair': 'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/33/Three_stray_cats_in_Japan_street%2C_August_2014.jpg/3840px-Three_stray_cats_in_Japan_street%2C_August_2014.jpg',
      'Ragdoll': 'https://upload.wikimedia.org/wikipedia/commons/6/64/Ragdoll_from_Gatil_Ragbelas.jpg',
      'Bengal': 'https://upload.wikimedia.org/wikipedia/commons/b/ba/Paintedcats_Red_Star_standing.jpg',
      'Budgerigar': 'https://upload.wikimedia.org/wikipedia/commons/4/4a/Budgerigar-male-strzelecki-qld.jpg',
      'Cockatiel': 'https://upload.wikimedia.org/wikipedia/commons/8/8a/Cockatiel_3.jpg',
      'Domestic Rabbit': 'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/31/Heimtier_004_2023_08_26.jpg/3840px-Heimtier_004_2023_08_26.jpg',
      'Goldfish': 'https://upload.wikimedia.org/wikipedia/commons/6/65/Gold_fish1.jpg',
      'Hamster': 'https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4a/European_hamster_%28Cricetus_cricetus%29_Meidling.jpg/3840px-European_hamster_%28Cricetus_cricetus%29_Meidling.jpg',
    };

    const breeds = await Breed.insertMany([
      // The four breeds the demo pets below reference (breeds[0..2]).
      { name: 'Golden Retriever', species: 'dog', origin: 'Scotland', lifespan: '10-12 years', weightRange: '25-34 kg', heightRange: '51-61 cm', temperament: ['Friendly', 'Intelligent', 'Devoted', 'Gentle'], exerciseRequirements: 'High - needs 1-2 hours daily exercise', groomingGuide: 'Brush 2-3 times per week, daily during shedding', commonDiseases: ['Hip dysplasia', 'Elbow dysplasia', 'Cataracts', 'Heart issues'], suitableEnvironment: 'House with yard, active family', characteristics: [], nutritionNotes: '', source: 'curated', verificationStatus: 'verified', imagenetLabel: '', images: [], popularity: 0, isActive: true, description: 'A friendly, reliable, and trustworthy dog that makes an excellent family pet.' },
      { name: 'Persian Cat', species: 'cat', origin: 'Iran (Persia)', lifespan: '12-17 years', weightRange: '3-6 kg', heightRange: '25-30 cm', temperament: ['Gentle', 'Quiet', 'Affectionate', 'Lazy'], exerciseRequirements: 'Low - indoor play sufficient', groomingGuide: 'Daily brushing required due to long coat', commonDiseases: ['Polycystic kidney disease', 'Respiratory issues', 'Eye conditions'], suitableEnvironment: 'Indoor, calm household', characteristics: [], nutritionNotes: '', source: 'curated', verificationStatus: 'verified', imagenetLabel: '', images: [], popularity: 0, isActive: true, description: 'A luxurious long-haired cat known for its sweet and gentle personality.' },
      { name: 'Labrador Retriever', species: 'dog', origin: 'Canada', lifespan: '10-14 years', weightRange: '25-36 kg', heightRange: '55-62 cm', temperament: ['Outgoing', 'Even tempered', 'Gentle', 'Intelligent'], exerciseRequirements: 'High - very active breed', groomingGuide: 'Weekly brushing, more during shedding season', commonDiseases: ['Hip dysplasia', 'Obesity', 'Ear infections'], suitableEnvironment: 'Active family, house with yard', characteristics: [], nutritionNotes: '', source: 'curated', verificationStatus: 'verified', imagenetLabel: '', images: [], popularity: 0, isActive: true, description: "America's most popular dog breed, known for being friendly and outgoing." },
      { name: 'Siamese Cat', species: 'cat', origin: 'Thailand', lifespan: '15-20 years', weightRange: '3-5 kg', heightRange: '20-25 cm', temperament: ['Vocal', 'Social', 'Intelligent', 'Playful'], exerciseRequirements: 'Moderate - interactive play needed', groomingGuide: 'Weekly brushing, minimal shedding', commonDiseases: ['Respiratory issues', 'Dental problems', 'Amyloidosis'], suitableEnvironment: 'Indoor, social household', characteristics: [], nutritionNotes: '', source: 'curated', verificationStatus: 'verified', imagenetLabel: '', images: [], popularity: 0, isActive: true, description: 'A vocal and social cat that forms strong bonds with its owners.' },

      // Curated FamiPet breeds (idempotent via keyOf; includes dogs/cats/birds/rabbit/fish/other)
      { name: "Beagle", species: "dog", origin: "England", lifespan: "12-15 years", weightRange: "8-14 kg", heightRange: "33-38 cm",
        temperament: ["Curious", "Friendly", "Merry"],
        exerciseRequirements: "Moderate daily walks and sniffing time.",
        groomingGuide: "Brush once a week; ears need regular checks.",
        commonDiseases: ["Ear infections", "Obesity"],
        suitableEnvironment: "Apartment or house with a secure yard.",
        characteristics: [],
        nutritionNotes: "",
        description: "Friendly, scent-driven hound that thrives on exploration.",
        images: [],
        popularity: 0,
        source: "curated",
        verificationStatus: "verified",
        imagenetLabel: "",
        isActive: true },
      { name: "German Shepherd", species: "dog", origin: "Germany", lifespan: "9-13 years", weightRange: "22-40 kg", heightRange: "55-65 cm",
        temperament: ["Loyal", "Courageous", "Intelligent"],
        exerciseRequirements: "High \u2014 daily physical and mental exercise.",
        groomingGuide: "Brush 2-3 times a week, more during shedding.",
        commonDiseases: ["Hip dysplasia", "Elbow dysplasia"],
        suitableEnvironment: "Active household with space to exercise.",
        characteristics: [],
        nutritionNotes: "",
        description: "Highly trainable working dog that bonds strongly with its family.",
        images: [],
        popularity: 0,
        source: "curated",
        verificationStatus: "verified",
        imagenetLabel: "",
        isActive: true },
      { name: "Pomeranian", species: "dog", origin: "Germany/Poland", lifespan: "12-16 years", weightRange: "1.4-3.2 kg", heightRange: "18-30 cm",
        temperament: ["Alert", "Lively", "Bold"],
        exerciseRequirements: "Short daily walks and indoor play.",
        groomingGuide: "Brush 2-3 times a week, daily during blow-outs.",
        commonDiseases: ["Dental disease", "Luxating patella"],
        suitableEnvironment: "Apartment-friendly with supervision.",
        characteristics: [],
        nutritionNotes: "",
        description: "Spirited toy dog with a thick double coat.",
        images: [],
        popularity: 0,
        source: "curated",
        verificationStatus: "verified",
        imagenetLabel: "",
        isActive: true },
      { name: "Rottweiler", species: "dog", origin: "Germany", lifespan: "8-10 years", weightRange: "35-48 kg", heightRange: "56-69 cm",
        temperament: ["Loyal", "Confident", "Calm"],
        exerciseRequirements: "Daily walks and structured activity.",
        groomingGuide: "Weekly brushing.",
        commonDiseases: ["Hip dysplasia", "Cardiac issues"],
        suitableEnvironment: "Experienced owner, secure yard.",
        characteristics: [],
        nutritionNotes: "",
        description: "Steady protector that does best with consistent training.",
        images: [],
        popularity: 0,
        source: "curated",
        verificationStatus: "verified",
        imagenetLabel: "",
        isActive: true },
      { name: "Siberian Husky", species: "dog", origin: "Siberia", lifespan: "12-14 years", weightRange: "16-27 kg", heightRange: "50-60 cm",
        temperament: ["Energetic", "Friendly", "Independent"],
        exerciseRequirements: "High \u2014 needs regular vigorous exercise.",
        groomingGuide: "Brush weekly, daily during blow-outs.",
        commonDiseases: ["Eye conditions", "Hip dysplasia"],
        suitableEnvironment: "Cold climates or secure, active home.",
        characteristics: [],
        nutritionNotes: "",
        description: "Athletic sled dog with a strong prey drive if under-exercised.",
        images: [],
        popularity: 0,
        source: "curated",
        verificationStatus: "verified",
        imagenetLabel: "",
        isActive: true },
      { name: "Domestic Shorthair", species: "cat", origin: "Unknown", lifespan: "12-18 years", weightRange: "3-7 kg", heightRange: "20-30 cm",
        temperament: ["Adaptable", "Friendly", "Independent"],
        exerciseRequirements: "Moderate indoor play.",
        groomingGuide: "Brush weekly.",
        commonDiseases: ["Obesity", "Dental disease"],
        suitableEnvironment: "Indoor apartment or house.",
        characteristics: [],
        nutritionNotes: "",
        description: "Hardy, low-maintenance companion well-suited to most homes.",
        images: [],
        popularity: 0,
        source: "curated",
        verificationStatus: "verified",
        imagenetLabel: "",
        isActive: true },
      { name: "Ragdoll", species: "cat", origin: "USA", lifespan: "12-17 years", weightRange: "3.6-9 kg", heightRange: "22-30 cm",
        temperament: ["Docile", "Affectionate", "Relaxed"],
        exerciseRequirements: "Light play.",
        groomingGuide: "Brush 2-3 times a week.",
        commonDiseases: ["Hypertrophic cardiomyopathy"],
        suitableEnvironment: "Calm indoor home.",
        characteristics: [],
        nutritionNotes: "",
        description: "Gentle, floppy lap cat that thrives on company.",
        images: [],
        popularity: 0,
        source: "curated",
        verificationStatus: "verified",
        imagenetLabel: "",
        isActive: true },
      { name: "Bengal", species: "cat", origin: "USA", lifespan: "12-16 years", weightRange: "3.5-8 kg", heightRange: "22-30 cm",
        temperament: ["Active", "Curious", "Intelligent"],
        exerciseRequirements: "High \u2014 needs enrichment and play.",
        groomingGuide: "Minimal; weekly brushing.",
        commonDiseases: ["Progressive retinal atrophy"],
        suitableEnvironment: "Enriched indoor home with vertical space.",
        characteristics: [],
        nutritionNotes: "",
        description: "Athletic, talkative cat with a bold spotted coat.",
        images: [],
        popularity: 0,
        source: "curated",
        verificationStatus: "verified",
        imagenetLabel: "",
        isActive: true },
      { name: "Budgerigar", species: "bird", origin: "Australia", lifespan: "5-10 years", weightRange: "30-40 g", heightRange: "15-20 cm",
        temperament: ["Social", "Curious", "Vocal"],
        exerciseRequirements: "Time outside cage for safe flight/play.",
        groomingGuide: "Fresh water for bathing; nail trims as needed.",
        commonDiseases: ["Feather plucking", "Respiratory issues"],
        suitableEnvironment: "Indoor aviary or spacious cage in social home.",
        characteristics: [],
        nutritionNotes: "",
        description: "Small, intelligent parakeet that thrives with companionship.",
        images: [],
        popularity: 0,
        source: "curated",
        verificationStatus: "verified",
        imagenetLabel: "",
        isActive: true },
      { name: "Cockatiel", species: "bird", origin: "Australia", lifespan: "15-25 years", weightRange: "75-110 g", heightRange: "30-33 cm",
        temperament: ["Affectionate", "Gentle", "Vocal"],
        exerciseRequirements: "Daily supervised out-of-cage time.",
        groomingGuide: "Bathing access; trim nails/feathers if advised.",
        commonDiseases: ["Respiratory issues"],
        suitableEnvironment: "Quiet indoor room away from drafts.",
        characteristics: [],
        nutritionNotes: "",
        description: "Affectionate, whistling companion with a long lifespan.",
        images: [],
        popularity: 0,
        source: "curated",
        verificationStatus: "verified",
        imagenetLabel: "",
        isActive: true },
      { name: "Domestic Rabbit", species: "rabbit", origin: "Europe", lifespan: "8-12 years", weightRange: "1-6 kg", heightRange: "20-40 cm",
        temperament: ["Gentle", "Social", "Timid"],
        exerciseRequirements: "Daily safe, supervised exercise space.",
        groomingGuide: "Brush long-haired weekly, short-haired monthly.",
        commonDiseases: ["Gastrointestinal stasis", "Dental disease"],
        suitableEnvironment: "Indoor or protected outdoor enclosure, predator-free.",
        characteristics: [],
        nutritionNotes: "",
        description: "Social herbivore that needs a high-fibre diet and space to hop.",
        images: [],
        popularity: 0,
        source: "curated",
        verificationStatus: "verified",
        imagenetLabel: "",
        isActive: true },
      { name: "Goldfish", species: "fish", origin: "Asia", lifespan: "10-30 years", weightRange: "10-500 g", heightRange: "5-25 cm",
        temperament: ["Peaceful"],
        exerciseRequirements: "Adequate tank volume and filtration.",
        groomingGuide: "Maintain water quality (weekly partial changes).",
        commonDiseases: ["Ich", "Fin rot"],
        suitableEnvironment: "Properly filtered tank (not a bowl) with cycling.",
        characteristics: [],
        nutritionNotes: "",
        description: "Long-lived carp that needs consistent water quality over size.",
        images: [],
        popularity: 0,
        source: "curated",
        verificationStatus: "verified",
        imagenetLabel: "",
        isActive: true },
      { name: "Hamster", species: "other", origin: "Syria", lifespan: "2-3 years", weightRange: "85-150 g", heightRange: "10-15 cm",
        temperament: ["Nocturnal", "Curious", "Solitary"],
        exerciseRequirements: "Wheel and enrichment daily.",
        groomingGuide: "Self-grooming; spot-clean enclosure.",
        commonDiseases: ["Wet tail", "Dental issues"],
        suitableEnvironment: "Spacious, ventilated enclosure, escape-proof.",
        characteristics: [],
        nutritionNotes: "",
        description: "Nocturnal rodent best observed in the evening.",
        images: [],
        popularity: 0,
        source: "curated",
        verificationStatus: "verified",
        imagenetLabel: "",
        isActive: true },

    ]);

    // Attach photos by name after insert so the curated list above stays a
    // plain readable table and the image map stays in one place.
    await Promise.all(
      breeds.map((breed) =>
        BREED_IMAGES[breed.name]
          ? Breed.updateOne({ _id: breed._id }, { $set: { images: [BREED_IMAGES[breed.name]] } })
          : null
      )
    );

    const pets = await Pet.insertMany([
      { owner: admin._id, breed: breeds[0]._id, name: 'Buddy', species: 'dog', gender: 'male', age: 2, weight: 30, color: 'Golden', vaccinated: true, adopted: false, status: 'available', description: 'Friendly and energetic Golden Retriever looking for a loving home. Great with kids!', images: ['https://images.unsplash.com/photo-1552053831-71594a27632d?w=400'] },
      { owner: admin._id, breed: breeds[1]._id, name: 'Luna', species: 'cat', gender: 'female', age: 1, weight: 4, color: 'White', vaccinated: true, adopted: false, status: 'available', description: 'Beautiful Persian cat with a calm demeanor. Perfect lap cat!', images: ['https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=400'] },
      { owner: user._id, breed: breeds[2]._id, name: 'Max', species: 'dog', gender: 'male', age: 3, weight: 32, color: 'Chocolate', vaccinated: true, adopted: false, status: 'available', description: 'Loyal and loving Labrador who loves swimming and playing fetch.', images: ['https://images.unsplash.com/photo-1561037404-61cd46aa615b?w=400'] },
      { owner: admin2._id, breed: breeds[0]._id, name: 'Bella', species: 'dog', gender: 'female', age: 4, weight: 28, color: 'Cream', vaccinated: true, adopted: false, status: 'available', description: 'Gentle Golden Retriever who is calm around children and other dogs.', images: [] },
      { owner: admin3._id, breed: breeds[1]._id, name: 'Simba', species: 'cat', gender: 'male', age: 2, weight: 5, color: 'Off-white', vaccinated: true, adopted: false, status: 'available', description: 'Quiet Persian who enjoys sunny windowsills and slow afternoons.', images: [] },
      { owner: user2._id, breed: breeds[2]._id, name: 'Rocky', species: 'dog', gender: 'male', age: 5, weight: 34, color: 'Black', vaccinated: true, adopted: false, status: 'available', description: 'Adult Labrador with a calm temperament and a healthy appetite.', images: [] },
      { owner: user3._id, breed: breeds[3]._id, name: 'Cleo', species: 'cat', gender: 'female', age: 1, weight: 4, color: 'Seal point', vaccinated: true, adopted: false, status: 'available', description: 'Playful Siamese kitten who follows her person everywhere.', images: [] },
      { owner: user4._id, breed: breeds[0]._id, name: 'Rex', species: 'dog', gender: 'male', age: 6, weight: 31, color: 'Golden', vaccinated: true, adopted: false, status: 'available', description: 'Senior Golden Retriever, relaxed and friendly, needs short walks.', images: [] },
    ]);

    const veterinarians = await Veterinarian.insertMany([
      { name: 'Dr. Sarah Johnson', email: 'sarah.johnson@vet.com', phone: '+1-555-0101', specialization: ['Small Animals', 'Surgery', 'Dermatology'], qualifications: ['DVM', 'MS Veterinary Surgery'], experience: 12, clinic: 'Paws & Claws Veterinary Clinic', address: '123 Main Street', city: 'New York', rating: 4.8, availability: [{ day: 'Monday', startTime: '09:00', endTime: '17:00', isAvailable: true }, { day: 'Tuesday', startTime: '09:00', endTime: '17:00', isAvailable: true }, { day: 'Wednesday', startTime: '09:00', endTime: '17:00', isAvailable: true }], consultationFee: 75 },
      { name: 'Dr. Michael Chen', email: 'michael.chen@vet.com', phone: '+1-555-0102', specialization: ['Exotic Animals', 'Avian Medicine', 'Internal Medicine'], qualifications: ['DVM', 'PhD Avian Medicine'], experience: 8, clinic: 'Exotic Pet Care Center', address: '456 Oak Avenue', city: 'Los Angeles', rating: 4.9, availability: [{ day: 'Monday', startTime: '10:00', endTime: '18:00', isAvailable: true }, { day: 'Thursday', startTime: '10:00', endTime: '18:00', isAvailable: true }, { day: 'Friday', startTime: '10:00', endTime: '18:00', isAvailable: true }], consultationFee: 90 },
    ]);

    // Every additional account gets the same resource set as the demo user
    // (pet, health record, vaccination, appointment, reminder, notification)
    // so no one lands on an empty dashboard after signing in.
    const extraAccounts = [
      { user: admin2, pet: pets[3], vet: veterinarians[0] },
      { user: admin3, pet: pets[4], vet: veterinarians[1] },
      { user: user2, pet: pets[5], vet: veterinarians[0] },
      { user: user3, pet: pets[6], vet: veterinarians[1] },
      { user: user4, pet: pets[7], vet: veterinarians[0] },
    ];

    await CommunityPost.insertMany([
      { user: user._id, title: 'Tips for introducing a new puppy to your home', content: 'When bringing a new puppy home, keep the first days calm, set up a dedicated sleeping area, and start crate training early. Consistency wins!', category: 'pet-care', image: '', likes: [admin._id], comments: [{ user: admin._id, text: 'Great advice, thanks for sharing!' }] },
      { user: admin._id, title: 'How to tell if your cat is stressed', content: 'Look out for excessive grooming, hiding, changes in appetite, or litter box avoidance. A quiet routine and vertical spaces help a lot.', category: 'health', image: '', likes: [user._id], comments: [] },
      { user: user._id, title: 'Best walking routes for dogs this season', content: 'Early mornings and evenings are cooler. Avoid hot pavement - if it is too hot for your hand, it is too hot for paws.', category: 'general', image: '', likes: [], comments: [] },
    ]);

    await LostFound.insertMany([
      { user: user._id, type: 'lost', petName: 'Coco', species: 'dog', breed: 'Beagle', gender: 'male', color: 'Brown and white', description: 'Lost near the downtown park this morning. Wearing a blue collar with a bell. Very friendly.', location: 'Downtown Park', date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), contactName: 'Demo User', contactPhone: '+1-555-0201', images: [], status: 'active' },
      { user: admin._id, type: 'found', petName: 'Milo', species: 'cat', breed: 'Tabby', gender: 'male', color: 'Gray', description: 'Found a friendly gray cat near the Riverside shopping center. Currently safe with us, no chip found.', location: 'Riverside Shopping Center', date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), contactName: 'Admin User', contactPhone: '+1-555-0202', images: [], status: 'active' },
    ]);

    await HealthRecord.insertMany([
      { user: user._id, pet: pets[2]._id, diagnosis: 'Routine checkup', treatment: 'Full physical, teeth cleaning recommended', doctor: 'Dr. Sarah Johnson', hospital: 'Paws & Claws Veterinary Clinic', visitDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), nextVisit: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000), notes: 'Healthy weight, annual booster due next month.' },
      ...extraAccounts.map(({ user: u, pet, vet }) => ({ user: u._id, pet: pet._id, diagnosis: 'Annual checkup', treatment: 'General health review, weight tracked', doctor: vet.name, hospital: vet.clinic, visitDate: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000), nextVisit: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), notes: `Healthy overall. Next visit booked for ${pet.name}.` })),
    ]);

    await Vaccination.insertMany([
      { user: user._id, pet: pets[2]._id, vaccineName: 'Rabies Booster', doseNumber: 2, vaccinationDate: new Date(Date.now() - 320 * 24 * 60 * 60 * 1000), nextDueDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000), veterinarian: 'Dr. Sarah Johnson', hospital: 'Paws & Claws Veterinary Clinic', status: 'Pending' },
      ...extraAccounts.map(({ user: u, pet, vet }) => ({ user: u._id, pet: pet._id, vaccineName: 'Rabies Booster', doseNumber: 2, vaccinationDate: new Date(Date.now() - 300 * 24 * 60 * 60 * 1000), nextDueDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), veterinarian: vet.name, hospital: vet.clinic, status: 'Pending' })),
    ]);

    const reminderDate = new Date();
    reminderDate.setDate(reminderDate.getDate() + 3);

    await Appointment.insertMany([
      {
        user: user._id,
        pet: pets[2]._id,
        veterinarian: veterinarians[0]._id,
        date: reminderDate,
        time: '10:30',
        type: 'checkup',
        status: 'confirmed',
        symptoms: 'Annual booster vaccination',
        notes: 'Bring vaccination records.',
        fee: veterinarians[0].consultationFee,
      },
      ...extraAccounts.map(({ user: u, pet, vet }, i) => ({
        user: u._id,
        pet: pet._id,
        veterinarian: vet._id,
        date: new Date(Date.now() + (5 + i * 2) * 24 * 60 * 60 * 1000),
        time: ['09:00', '11:00', '14:00', '15:30', '16:00'][i],
        type: 'checkup',
        status: 'confirmed',
        symptoms: 'Annual vaccination and wellness exam',
        notes: `Routine visit for ${pet.name}.`,
        fee: vet.consultationFee,
      })),
    ]);

    await Reminder.insertMany([
      { user: user._id, pet: pets[2]._id, title: 'Morning walk', type: 'exercise', description: 'Daily morning walk around the park.', date: new Date(), time: '07:00', frequency: 'daily', isActive: true, isCompleted: false },
      { user: user._id, pet: pets[2]._id, title: 'Heartworm medication', type: 'medicine', description: 'Monthly heartworm prevention for Max.', date: reminderDate, time: '20:00', frequency: 'monthly', isActive: true, isCompleted: false },
      ...extraAccounts.map(({ user: u, pet }) => ({ user: u._id, pet: pet._id, title: `${pet.name} - evening walk`, type: 'exercise', description: `Daily walk for ${pet.name}.`, date: new Date(), time: '18:00', frequency: 'daily', isActive: true, isCompleted: false })),
      ...extraAccounts.map(({ user: u, pet, vet }) => ({ user: u._id, pet: pet._id, title: `${pet.name} - vaccination due`, type: 'vaccination', description: `Rabies booster at ${vet.clinic}.`, date: reminderDate, time: '10:00', frequency: 'once', isActive: true, isCompleted: false })),
    ]);

    await Adoption.create({
      pet: pets[0]._id,
      user: user._id,
      fullName: 'Demo User',
      phone: '+1-555-0201',
      address: '123 Demo Street, New York',
      occupation: 'Software Developer',
      experienceWithPets: '3 years with Max, a Labrador.',
      reasonForAdoption: 'Looking for a playful companion for Max and our family.',
      status: 'Pending',
    });

    await Notification.create([
      { user: user._id, title: 'Welcome to FamiPet!', message: 'Your account is ready. Start by adding your pet and booking an appointment.', type: 'system', isRead: false },
      { user: user._id, title: 'Vaccination due soon', message: 'Max has a rabies booster due in the next few days.', type: 'vaccination', isRead: false },
      ...extraAccounts.map(({ user: u, pet }) => ({ user: u._id, title: 'Welcome to FamiPet!', message: `${pet.name}'s profile is set up and ready to explore.`, type: 'system', isRead: false })),
      ...extraAccounts.map(({ user: u, pet, vet }) => ({ user: u._id, title: 'Appointment confirmed', message: `${pet.name} has a checkup booked at ${vet.clinic}.`, type: 'appointment', isRead: false })),
    ]);

    logger.info('Seed data created successfully!');
    logger.info('Login credentials (demo accounts, all passwords end in "famipet"):');
    for (const u of [admin, admin2, admin3, user, user2, user3, user4]) {
      logger.info(`  ${u.role === 'admin' ? 'ADMIN' : 'USER '}  ${u.email}  /  ${u.role === 'admin' ? ADMIN_PW : USER_PW}`);
    }
    process.exit(0);
  } catch (error) {
    logger.error('Seed error:', error);
    process.exit(1);
  }
};

seedData();