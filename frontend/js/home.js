const services = [

{
    title:"Pet Adoption",
    description:"Find loving pets waiting for a forever home.",
    icon:"assets/icons/pet-adoption.svg"
},

// {
//     title:"Vet Appointment",
//     description:"Book trusted veterinarians in just a few clicks.",
//     icon:"assets/icons/vet.svg"
// },

{
    title:"Health Records",
    description:"Store and manage your pet's medical history.",
    icon:"assets/icons/health.svg"
},

{
    title:"AI Pet Assistant",
    description:"Ask PetGPT anything about your furry friend.",
    icon:"assets/icons/ai.svg"
},

{
    title:"Lost & Found",
    description:"Help reunite lost pets with their families.",
    icon:"assets/icons/lost-found.svg"
},

{
    title:"Vaccination Tracker",
    description:"Never miss another vaccination reminder.",
    icon:"assets/icons/vaccination.svg"
},

// {
//     title:"Pet Adoption",
//     description:"Find loving pets waiting for a forever home.",
//     icon:"assets/icons/pet-adoption.svg"
// },

{
    title:"Community",
    description:"Connect with thousands of pet lovers.",
    icon:"assets/icons/community.svg"
}

];

const servicesGrid = document.getElementById("servicesGrid");

services.forEach(service=>{

servicesGrid.innerHTML += `

<div class="service-card">

<div class="service-icon">

<img src="${service.icon}" alt="${service.title}">

</div>

<div class="service-content">

<h3>${service.title}</h3>

<p>${service.description}</p>

</div>

</div>

`;

});

/* ==========================================
            WHY CHOOSE
========================================== */

const whyChoose = [

{
    title: "All-in-One Platform",
    description: "Adoption, healthcare, AI assistance and reminders in one place.",
    icon: "assets/icons/allheart.svg",
    color: "#FFEAF2",
    border: "#FF6B9A"
},

{
    title: "Pet Lovers Community",
    description: "Connect with pet owners, share experiences, and get helpful advice together.",
    icon: "assets/icons/community.svg",
    color: "#EAF6FF",
    border: "#4AA8FF"
},

{
    title: "AI PetGPT",
    description: "Get instant answers and smart guidance for your pets.",
    icon: "assets/icons/robot.svg",
    color: "#F2ECFF",
    border: "#9B6DFF"
},

{
    title: "Secure Health Records",
    description: "Keep vaccination and medical records safe and organized.",
    icon: "assets/icons/shield.svg",
    color: "#EAFBF2",
    border: "#38C976"
}

];

const whyGrid = document.getElementById("whyGrid");

whyChoose.forEach(item => {

whyGrid.innerHTML += `

<div class="why-card"
style="
border-top:6px solid ${item.border};
--accent:${item.border};
">

<div class="why-icon"
style="
background:${item.color};
">

<img src="${item.icon}" alt="${item.title}">

</div>

<h3>${item.title}</h3>

<p>${item.description}</p>

</div>

`;

});

/*==========================================
            BACK TO TOP
==========================================*/

const backToTop = document.getElementById("backToTop");

window.addEventListener("scroll", () => {

    if (window.scrollY > 300) {

        backToTop.classList.add("show");

    } else {

        backToTop.classList.remove("show");

    }

});

backToTop.addEventListener("click", () => {

    window.scrollTo({

        top: 0,

        behavior: "smooth"

    });

});
