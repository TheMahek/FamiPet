// =========================================================
// ImageNet label -> FamiPet breed candidate mapping.
// ---------------------------------------------------------
// MobileNetV2/ImageNet knows 1000 English noun phrases. Most of
// them are not pet breeds, so an ImageNet label is a CANDIDATE,
// never a breed. This table is the controlled gate that turns a
// candidate into a FamiPet breed (or refuses to):
//
//   imagenet slug  ->  { species, breedName, breedSpecific? }
//
// Rules this table encodes:
//
//   * Only labels that actually name a pet breed, or a species a
//     FamiPet breed record can legitimately represent, appear
//     here. Anything absent is reported as `unsupported` and is
//     NEVER turned into a breed.
//   * Keys are the SLUG form the ML service returns
//     (lowercase, non-alphanumeric runs collapsed to "_"), so the
//     two sides agree byte for byte. Slugs are index-independent,
//     so a future TensorFlow release cannot renumber this table.
//   * `breedSpecific: true`  - the label names a real breed
//     (all 118 ImageNet dog classes, Persian Cat, Siamese Cat).
//   * `breedSpecific: false` - the label names a species or coat
//     pattern ("tabby", "goldfish"). It maps to a generic breed
//     entry, so the caller applies a stricter confidence bar
//     (backend/config/breed-ai.js) and the record is written
//     `unverified`.
//   * `species` must be a Breed.species enum value. The mapping is
//     NOT limited to dog and cat: bird, rabbit, fish and other
//     are mapped too, and the table is open-ended.
//
// Every key below was transcribed from the real ImageNet-1k class
// index (tensorflow.keras decode_predictions, TF 2.21), which is
// why the odd spellings ("Chihuahua", "Shih-Tzu",
// "Staffordshire bullterrier") match the model's own vocabulary
// rather than an idealised one: the mapping has to speak the
// language the classifier emits.
// =========================================================

// The only species values the Breed model accepts.
const SPECIES = Object.freeze(["dog", "cat", "bird", "rabbit", "fish", "other"]);

// ImageNet class name -> slug. Byte-identical to
// ai/images.py::slugify_label; duplicated on purpose because the
// two runtimes share no module.
function slugify(label) {
  return String(label == null ? "" : label)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const TABLE = {
  "chihuahua": { species: "dog", breedName: "Chihuahua" },
  "japanese_spaniel": { species: "dog", breedName: "Japanese Chin" },
  "maltese_dog": { species: "dog", breedName: "Maltese Dog" },
  "pekinese": { species: "dog", breedName: "Pekinese" },
  "shih_tzu": { species: "dog", breedName: "Shih-Tzu" },
  "blenheim_spaniel": { species: "dog", breedName: "Blenheim Spaniel" },
  "papillon": { species: "dog", breedName: "Papillon" },
  "toy_terrier": { species: "dog", breedName: "Toy Terrier" },
  "rhodesian_ridgeback": { species: "dog", breedName: "Rhodesian Ridgeback" },
  "afghan_hound": { species: "dog", breedName: "Afghan Hound" },
  // ImageNet's label is the short form; the breed is the full name.
  "basset": { species: "dog", breedName: "Basset Hound" },
  "beagle": { species: "dog", breedName: "Beagle" },
  "bloodhound": { species: "dog", breedName: "Bloodhound" },
  "bluetick": { species: "dog", breedName: "Bluetick Coonhound" },
  "black_and_tan_coonhound": { species: "dog", breedName: "Black and Tan Coonhound" },
  "walker_hound": { species: "dog", breedName: "Walker Hound" },
  "english_foxhound": { species: "dog", breedName: "English Foxhound" },
  "redbone": { species: "dog", breedName: "Redbone Coonhound" },
  "borzoi": { species: "dog", breedName: "Borzoi" },
  "irish_wolfhound": { species: "dog", breedName: "Irish Wolfhound" },
  "italian_greyhound": { species: "dog", breedName: "Italian Greyhound" },
  "whippet": { species: "dog", breedName: "Whippet" },
  "ibizan_hound": { species: "dog", breedName: "Ibizan Hound" },
  "norwegian_elkhound": { species: "dog", breedName: "Norwegian Elkhound" },
  "otterhound": { species: "dog", breedName: "Otterhound" },
  "saluki": { species: "dog", breedName: "Saluki" },
  "scottish_deerhound": { species: "dog", breedName: "Scottish Deerhound" },
  "weimaraner": { species: "dog", breedName: "Weimaraner" },
  "staffordshire_bullterrier": { species: "dog", breedName: "Staffordshire Bullterrier" },
  "american_staffordshire_terrier": { species: "dog", breedName: "American Staffordshire Terrier" },
  "bedlington_terrier": { species: "dog", breedName: "Bedlington Terrier" },
  "border_terrier": { species: "dog", breedName: "Border Terrier" },
  "kerry_blue_terrier": { species: "dog", breedName: "Kerry Blue Terrier" },
  "irish_terrier": { species: "dog", breedName: "Irish Terrier" },
  "norfolk_terrier": { species: "dog", breedName: "Norfolk Terrier" },
  "norwich_terrier": { species: "dog", breedName: "Norwich Terrier" },
  "yorkshire_terrier": { species: "dog", breedName: "Yorkshire Terrier" },
  "wire_haired_fox_terrier": { species: "dog", breedName: "Wire Fox Terrier" },
  "lakeland_terrier": { species: "dog", breedName: "Lakeland Terrier" },
  "sealyham_terrier": { species: "dog", breedName: "Sealyham Terrier" },
  "airedale": { species: "dog", breedName: "Airedale Terrier" },
  "cairn": { species: "dog", breedName: "Cairn Terrier" },
  "australian_terrier": { species: "dog", breedName: "Australian Terrier" },
  "dandie_dinmont": { species: "dog", breedName: "Dandie Dinmont Terrier" },
  "boston_bull": { species: "dog", breedName: "Boston Bull" },
  "miniature_schnauzer": { species: "dog", breedName: "Miniature Schnauzer" },
  "giant_schnauzer": { species: "dog", breedName: "Giant Schnauzer" },
  "standard_schnauzer": { species: "dog", breedName: "Standard Schnauzer" },
  "scotch_terrier": { species: "dog", breedName: "Scotch Terrier" },
  "tibetan_terrier": { species: "dog", breedName: "Tibetan Terrier" },
  "silky_terrier": { species: "dog", breedName: "Silky Terrier" },
  "soft_coated_wheaten_terrier": { species: "dog", breedName: "Soft-Coated Wheaten Terrier" },
  "west_highland_white_terrier": { species: "dog", breedName: "West Highland White Terrier" },
  "lhasa": { species: "dog", breedName: "Lhasa Apso" },
  "flat_coated_retriever": { species: "dog", breedName: "Flat-Coated Retriever" },
  "curly_coated_retriever": { species: "dog", breedName: "Curly-Coated Retriever" },
  "golden_retriever": { species: "dog", breedName: "Golden Retriever" },
  "labrador_retriever": { species: "dog", breedName: "Labrador Retriever" },
  "chesapeake_bay_retriever": { species: "dog", breedName: "Chesapeake Bay Retriever" },
  "german_short_haired_pointer": { species: "dog", breedName: "German Shorthaired Pointer" },
  "vizsla": { species: "dog", breedName: "Vizsla" },
  "english_setter": { species: "dog", breedName: "English Setter" },
  "irish_setter": { species: "dog", breedName: "Irish Setter" },
  "gordon_setter": { species: "dog", breedName: "Gordon Setter" },
  "brittany_spaniel": { species: "dog", breedName: "Brittany Spaniel" },
  "clumber": { species: "dog", breedName: "Clumber Spaniel" },
  "english_springer": { species: "dog", breedName: "English Springer" },
  "welsh_springer_spaniel": { species: "dog", breedName: "Welsh Springer Spaniel" },
  "cocker_spaniel": { species: "dog", breedName: "Cocker Spaniel" },
  "sussex_spaniel": { species: "dog", breedName: "Sussex Spaniel" },
  "irish_water_spaniel": { species: "dog", breedName: "Irish Water Spaniel" },
  "kuvasz": { species: "dog", breedName: "Kuvasz" },
  "schipperke": { species: "dog", breedName: "Schipperke" },
  "groenendael": { species: "dog", breedName: "Belgian Shepherd (Groenendael)" },
  "malinois": { species: "dog", breedName: "Malinois" },
  "briard": { species: "dog", breedName: "Briard" },
  "kelpie": { species: "dog", breedName: "Australian Kelpie" },
  "komondor": { species: "dog", breedName: "Komondor" },
  "old_english_sheepdog": { species: "dog", breedName: "Old English Sheepdog" },
  "shetland_sheepdog": { species: "dog", breedName: "Shetland Sheepdog" },
  "collie": { species: "dog", breedName: "Rough Collie" },
  "border_collie": { species: "dog", breedName: "Border Collie" },
  "bouvier_des_flandres": { species: "dog", breedName: "Bouvier Des Flandres" },
  "rottweiler": { species: "dog", breedName: "Rottweiler" },
  "german_shepherd": { species: "dog", breedName: "German Shepherd" },
  "doberman": { species: "dog", breedName: "Doberman" },
  "miniature_pinscher": { species: "dog", breedName: "Miniature Pinscher" },
  "greater_swiss_mountain_dog": { species: "dog", breedName: "Greater Swiss Mountain Dog" },
  "bernese_mountain_dog": { species: "dog", breedName: "Bernese Mountain Dog" },
  "appenzeller": { species: "dog", breedName: "Appenzeller" },
  "entlebucher": { species: "dog", breedName: "Entlebucher Mountain Dog" },
  "boxer": { species: "dog", breedName: "Boxer" },
  "bull_mastiff": { species: "dog", breedName: "Bull Mastiff" },
  "tibetan_mastiff": { species: "dog", breedName: "Tibetan Mastiff" },
  "french_bulldog": { species: "dog", breedName: "French Bulldog" },
  "great_dane": { species: "dog", breedName: "Great Dane" },
  "saint_bernard": { species: "dog", breedName: "Saint Bernard" },
  "eskimo_dog": { species: "dog", breedName: "American Eskimo Dog" },
  "malamute": { species: "dog", breedName: "Alaskan Malamute" },
  "siberian_husky": { species: "dog", breedName: "Siberian Husky" },
  "dalmatian": { species: "dog", breedName: "Dalmatian" },
  "affenpinscher": { species: "dog", breedName: "Affenpinscher" },
  "basenji": { species: "dog", breedName: "Basenji" },
  "pug": { species: "dog", breedName: "Pug" },
  "leonberg": { species: "dog", breedName: "Leonberg" },
  "newfoundland": { species: "dog", breedName: "Newfoundland" },
  "great_pyrenees": { species: "dog", breedName: "Great Pyrenees" },
  "samoyed": { species: "dog", breedName: "Samoyed" },
  "pomeranian": { species: "dog", breedName: "Pomeranian" },
  "chow": { species: "dog", breedName: "Chow Chow" },
  "keeshond": { species: "dog", breedName: "Keeshond" },
  "brabancon_griffon": { species: "dog", breedName: "Brussels Griffon" },
  "pembroke": { species: "dog", breedName: "Pembroke Welsh Corgi" },
  "cardigan": { species: "dog", breedName: "Cardigan Welsh Corgi" },
  "toy_poodle": { species: "dog", breedName: "Toy Poodle" },
  "miniature_poodle": { species: "dog", breedName: "Miniature Poodle" },
  "standard_poodle": { species: "dog", breedName: "Standard Poodle" },
  "mexican_hairless": { species: "dog", breedName: "Xoloitzcuintli (Mexican Hairless)" },
  "persian_cat": { species: "cat", breedName: "Persian Cat", breedSpecific: true },
  "siamese_cat": { species: "cat", breedName: "Siamese Cat", breedSpecific: true },
  "tabby": { species: "cat", breedName: "Domestic Shorthair", breedSpecific: false },
  "tiger_cat": { species: "cat", breedName: "Domestic Shorthair", breedSpecific: false },
  "egyptian_cat": { species: "cat", breedName: "Domestic Shorthair", breedSpecific: false },
  "goldfish": { species: "fish", breedName: "Goldfish", breedSpecific: false },
  "macaw": { species: "bird", breedName: "Macaw", breedSpecific: false },
  "great_grey_owl": { species: "bird", breedName: "Great Grey Owl", breedSpecific: false },
  "hamster": { species: "other", breedName: "Hamster", breedSpecific: false },
  "guinea_pig": { species: "other", breedName: "Guinea Pig", breedSpecific: false },
  "wood_rabbit": { species: "rabbit", breedName: "Domestic Rabbit", breedSpecific: false },
};

// Map one ImageNet slug to a breed candidate, or null when the label is
// not a supported FamiPet breed. Returns a fresh object, so a caller
// cannot mutate the table.
function mapImageNetLabel(label) {
  const key = slugify(label);
  const entry = Object.prototype.hasOwnProperty.call(TABLE, key) ? TABLE[key] : null;
  if (!entry) return null;
  return {
    label: key,
    species: entry.species,
    breedName: entry.breedName,
    // Absent means true: every curated breed-level label is specific.
    breedSpecific: entry.breedSpecific !== false,
  };
}

// Count of supported labels. Used by the tests and the status endpoint.
function mappingSize() {
  return Object.keys(TABLE).length;
}

module.exports = { SPECIES, slugify, mapImageNetLabel, mappingSize, TABLE };
