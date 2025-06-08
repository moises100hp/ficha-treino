import { firebaseConfig } from './firebase-config.js'; 
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let userId;
let currentWorkoutData = {};

const defaultWorkout = {}; // Inicia vazio por padrão

const loginButton = document.getElementById('login-button');
const logoutButton = document.getElementById('logout-button');
const userInfo = document.getElementById('user-info');
const userNameEl = document.getElementById('user-name');
const appContainer = document.getElementById('app-container');
const tabsContainer = document.getElementById('tabs-container');
const mainContentContainer = document.getElementById('main-content-container');
const exerciseModal = document.getElementById('exerciseModal');
const planSubtitle = document.getElementById('plan-subtitle');

const provider = new GoogleAuthProvider();

async function signInWithGoogle() {
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("Erro ao fazer login com Google:", error);
    }
}

async function logOut() {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Erro ao fazer logout:", error);
    }
}

loginButton.addEventListener('click', signInWithGoogle);
logoutButton.addEventListener('click', logOut);

onAuthStateChanged(auth, user => {
    if (user) {
        userId = user.uid;
        userNameEl.textContent = `Logado como: ${user.displayName || user.email}`;
        
        const date = new Date();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        planSubtitle.textContent = `Mês ${month}`;
        
        userInfo.classList.remove('hidden');
        userInfo.classList.add('flex');
        loginButton.classList.add('hidden');
        appContainer.classList.remove('hidden');
        loadWorkout(userId);
    } else {
        userId = null;
        planSubtitle.textContent = 'Faça login para começar';
        userInfo.classList.add('hidden');
        userInfo.classList.remove('flex');
        loginButton.classList.remove('hidden');
        appContainer.classList.add('hidden');
        mainContentContainer.innerHTML = '';
        tabsContainer.innerHTML = '';
    }
});

function loadWorkout(uid) {
    const docRef = doc(db, "users", uid);
    onSnapshot(docRef, (docSnap) => {
        currentWorkoutData = docSnap.exists() ? docSnap.data().plan : defaultWorkout;
        renderUI();
    }, (error) => {
         console.error("Erro ao carregar dados do Firestore:", error);
         currentWorkoutData = defaultWorkout;
         renderUI();
    });
}

function saveToFirestore() {
    if (!userId) return;
    const docRef = doc(db, "users", userId);
    setDoc(docRef, { plan: currentWorkoutData }).catch(error => {
        console.error("Erro ao salvar no Firestore:", error);
    });
}

function renderUI() {
    tabsContainer.innerHTML = '';
    mainContentContainer.innerHTML = '';

    Object.keys(currentWorkoutData).forEach(fichaId => {
        const tabGroup = document.createElement('div');
        tabGroup.className = "tab-button-group";

        const tabButton = document.createElement('button');
        tabButton.className = "tab-button flex-1 sm:flex-none text-center py-2 px-4 font-semibold transition-all duration-300";
        tabButton.textContent = fichaId;
        tabButton.id = `btn-${fichaId}`;
        tabButton.onclick = () => showTab(fichaId);
        
        const deleteFichaBtn = document.createElement('button');
        deleteFichaBtn.className = "text-red-400 hover:text-red-600 font-bold px-2";
        deleteFichaBtn.innerHTML = '×';
        deleteFichaBtn.title = `Remover ${fichaId}`;
        deleteFichaBtn.onclick = () => deleteFicha(fichaId);

        tabGroup.appendChild(tabButton);
        tabGroup.appendChild(deleteFichaBtn);
        tabsContainer.appendChild(tabGroup);

        const contentDiv = document.createElement('div');
        contentDiv.id = fichaId;
        contentDiv.className = "tab-content";
        mainContentContainer.appendChild(contentDiv);
        
        renderFichaContent(fichaId);
    });
    
    const addFichaButton = document.createElement('button');
    addFichaButton.className = "bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors";
    addFichaButton.textContent = "+ Adicionar Ficha";
    addFichaButton.onclick = addFicha;
    tabsContainer.appendChild(addFichaButton);


    const firstFicha = Object.keys(currentWorkoutData)[0];
    if (firstFicha) {
        showTab(firstFicha);
    }
}

function renderFichaContent(fichaId) {
    const fichaContainer = document.getElementById(fichaId);
    fichaContainer.innerHTML = '';
    const sections = currentWorkoutData[fichaId];

    for(const sectionTitle in sections) {
        const sectionEl = document.createElement('div');
        sectionEl.innerHTML = `
            <div class="section-header">
                <h2 class="section-title">${sectionTitle}</h2>
                <button onclick="deleteSection('${fichaId}', '${sectionTitle}')" class="text-red-500 hover:text-red-700 font-bold p-2 text-xl" title="Remover Seção">×</button>
            </div>
        `;
        const exercisesContainer = document.createElement('div');
        exercisesContainer.className = 'space-y-4';
        
        const sectionId = `${fichaId}-${sectionTitle.replace(/[\s&]+/g, '-')}`;
        exercisesContainer.id = sectionId;
        
        if (Array.isArray(sections[sectionTitle])) {
            sections[sectionTitle].forEach((ex, index) => {
                exercisesContainer.innerHTML += createExerciseCard(fichaId, sectionTitle, index, ex.name, ex.details, ex.video);
            });
        }
        
        sectionEl.appendChild(exercisesContainer);
        sectionEl.innerHTML += `<div class="mt-4"><button onclick="openExerciseModal('${fichaId}', '${sectionTitle}')" class="bg-gray-500 text-white py-1 px-3 rounded-md hover:bg-gray-600 transition-colors text-sm">+ Adicionar Exercício</button></div>`;
        fichaContainer.appendChild(sectionEl);
    }
    
    const addSectionButton = document.createElement('button');
    addSectionButton.className = "mt-6 bg-indigo-500 text-white py-2 px-4 rounded-md hover:bg-indigo-600 transition-colors";
    addSectionButton.textContent = "+ Adicionar Seção";
    addSectionButton.onclick = () => addSection(fichaId);
    fichaContainer.appendChild(addSectionButton);
}

function addFicha() {
    const fichaName = prompt("Digite o nome da nova ficha (ex: Ficha D):");
    if (fichaName && !currentWorkoutData[fichaName]) {
        currentWorkoutData[fichaName] = {};
        renderUI();
        showTab(fichaName);
        saveToFirestore();
    } else if (currentWorkoutData[fichaName]) {
        alert("Já existe uma ficha com este nome.");
    }
}

window.deleteFicha = function(fichaId) {
     if (confirm(`Tem certeza que deseja remover a ficha "${fichaId}"? Esta ação não pode ser desfeita.`)) {
        delete currentWorkoutData[fichaId];
        renderUI();
        saveToFirestore();
    }
}

function addSection(fichaId) {
    const sectionName = prompt("Digite o nome da nova seção (ex: Bíceps):");
    if (sectionName && !currentWorkoutData[fichaId][sectionName]) {
        currentWorkoutData[fichaId][sectionName] = [];
        renderFichaContent(fichaId);
         saveToFirestore();
    } else if (currentWorkoutData[fichaId][sectionName]) {
        alert("Já existe uma seção com este nome nesta ficha.");
    }
}

window.deleteSection = function(fichaId, sectionTitle) {
    if (confirm(`Tem certeza que deseja remover a seção "${sectionTitle}"?`)) {
        delete currentWorkoutData[fichaId][sectionTitle];
        renderFichaContent(fichaId);
        saveToFirestore();
    }
}

function createExerciseCard(fichaId, sectionTitle, index, name, details, video) {
    return `
        <div class="exercise-card">
            <div class="flex-shrink-0 bg-gray-200 p-3 rounded-full"><svg class="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.25278C12 6.25278 10.7528 5 9.49998 5C7.49998 5 6.25278 6.25278 6.25278 7.50002C6.25278 8.74722 7.49998 10 9.49998 10C10.7528 10 12 8.74722 12 8.74722m1.5-4.74722C13.5 3.00556 14.7472 2 16.5 2c2 0 3.2472 1.25278 3.2472 2.50002C19.7472 6.24722 18.5 7.5 16.5 7.5c-1.2472 0-2.5-1.25278-2.5-2.24722zM12 17.7472c0 0-1.2472 1.2528-2.50002 1.2528C7.49998 19 6.25278 17.7472 6.25278 16.5c0-1.2472 1.2472-2.50002 2.2472-2.50002C9.2472 14 12 17.7472 12 17.7472zm1.5 4.7528c0 0 1.2472-1.2528 2.5-1.2528 2 0 3.2472 1.2528 3.2472 2.5 0 1.2472-1.2472 2.50002-2.2472 2.50002-1 0-2.5-1.2528-2.5-2.50002zM3 12h18"></path></svg></div>
            <div class="flex-1">
                <h3 class="font-semibold text-gray-900">${name}</h3>
                <p class="text-sm text-gray-500">${details}</p>
            </div>
            <button onclick="openModal('${video}')" class="bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors mr-6">Ver Vídeo</button>
            <button onclick="deleteExercise('${fichaId}', '${sectionTitle}', ${index})" class="delete-btn" title="Excluir exercício">×</button>
        </div>
    `;
}

window.deleteExercise = function(fichaId, sectionTitle, index) {
    currentWorkoutData[fichaId][sectionTitle].splice(index, 1);
    renderFichaContent(fichaId);
    saveToFirestore();
}

window.openExerciseModal = function(fichaId, sectionTitle) {
    exerciseModal.dataset.fichaId = fichaId;
    exerciseModal.dataset.sectionTitle = sectionTitle;
    document.getElementById('new-exercise-name').value = '';
    document.getElementById('new-exercise-details').value = '';
    document.getElementById('new-exercise-video').value = '';
    exerciseModal.classList.remove('hidden');
    exerciseModal.classList.add('flex');
}

window.saveNewExercise = function() {
    const { fichaId, sectionTitle } = exerciseModal.dataset;
    const name = document.getElementById('new-exercise-name').value;
    const details = document.getElementById('new-exercise-details').value;
    const video = document.getElementById('new-exercise-video').value;

    if (!name || !details) {
        alert("Por favor, preencha o nome e a descrição do exercício.");
        return;
    }
    
    if (!currentWorkoutData[fichaId][sectionTitle]) {
         currentWorkoutData[fichaId][sectionTitle] = [];
    }
    
    currentWorkoutData[fichaId][sectionTitle].push({name, details, video});
    
    renderFichaContent(fichaId);
    closeModal('exerciseModal');
    saveToFirestore();
}

window.showTab = function(tabId) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(tabId)?.classList.add('active');
    document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
    document.getElementById(`btn-${tabId}`)?.classList.add('active');
}

function getEmbedUrl(url) {
    if (!url) return '';
    let videoId;
    try {
         if (url.includes('youtube.com/shorts/')) {
            videoId = url.split('/shorts/')[1].split('?')[0];
        } else if (url.includes('youtu.be/')) {
            videoId = url.split('youtu.be/')[1].split('?')[0];
        } else {
            const urlParams = new URLSearchParams(new URL(url).search);
            videoId = urlParams.get('v');
        }
    } catch (error) {
        console.error("URL do vídeo inválida:", url);
        return '';
    }
    return videoId ? `https://www.youtube.com/embed/${videoId}?autoplay=1` : '';
}

window.openModal = function(videoUrl) {
    const embedUrl = getEmbedUrl(videoUrl);
    const videoModal = document.getElementById('videoModal');
    if (embedUrl) {
        document.getElementById('videoFrame').src = embedUrl;
        videoModal.classList.remove('hidden');
        videoModal.classList.add('flex');
    }
}

window.closeModal = function(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    if (modalId === 'videoModal') {
        document.getElementById('videoFrame').src = '';
    }
}

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeModal('videoModal');
        closeModal('exerciseModal');
    }
});

// Tornando funções globais para que possam ser chamadas pelo HTML
window.showTab = showTab;
window.deleteFicha = deleteFicha;
window.addFicha = addFicha;
window.deleteSection = deleteSection;
window.openExerciseModal = openExerciseModal;
window.deleteExercise = deleteExercise;
window.saveNewExercise = saveNewExercise;
window.openModal = openModal;
window.closeModal = closeModal;


initializeApp();
