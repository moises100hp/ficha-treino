import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, onSnapshot, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = { uid: null, role: null, personalId: null, selectedStudentId: null };
let currentWorkoutData = {};

const loginButton = document.getElementById('login-button');
const logoutButton = document.getElementById('logout-button');
const userInfo = document.getElementById('user-info');
const userNameEl = document.getElementById('user-name');
const appContainer = document.getElementById('app-container');
const tabsContainer = document.getElementById('tabs-container');
const mainContentContainer = document.getElementById('main-content-container');
const exerciseModal = document.getElementById('exerciseModal');
const roleModal = document.getElementById('role-modal');
const planSubtitle = document.getElementById('plan-subtitle');

const provider = new GoogleAuthProvider();

loginButton.addEventListener('click', () => signInWithPopup(auth, provider));
logoutButton.addEventListener('click', () => signOut(auth));
document.getElementById('aluno-btn').addEventListener('click', () => {
    document.getElementById('role-choice-buttons').classList.add('hidden');
    document.getElementById('personal-code-input-div').classList.remove('hidden');
});
document.getElementById('personal-btn').addEventListener('click', () => handleRoleSelection('personal'));
document.getElementById('link-personal-btn').addEventListener('click', handleLinkToPersonal);
document.getElementById('student-selector').addEventListener('change', handleStudentSelection);

onAuthStateChanged(auth, async user => {
    if (user) {
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            currentUser = { ...currentUser, uid: user.uid, ...userData };

            userInfo.classList.remove('hidden');
            loginButton.classList.add('hidden');
            userNameEl.textContent = `Logado como: ${user.displayName}`;

            if (currentUser.role === 'personal') {
                document.getElementById('personal-dashboard').classList.remove('hidden');
                document.getElementById('personal-code').textContent = user.uid;
                loadStudentsForPersonal(user.uid);
            } else if (currentUser.role === 'aluno') {
                appContainer.classList.remove('hidden');
                loadWorkoutForStudent(user.uid, currentUser.personalId);
            }
        } else {
            roleModal.classList.add('flex');
            roleModal.classList.remove('hidden');
        }
    } else {
        Object.assign(currentUser, { uid: null, role: null, personalId: null, selectedStudentId: null });
        appContainer.classList.add('hidden');
        document.getElementById('personal-dashboard').classList.add('hidden');
        userInfo.classList.add('hidden');
        loginButton.classList.remove('hidden');
    }
});

async function handleRoleSelection(role) {
    const user = auth.currentUser;
    const userDocRef = doc(db, "users", user.uid);
    const data = { role, displayName: user.displayName, email: user.email };

    await setDoc(userDocRef, data);

    if (role === 'personal') {
        const personalPublicDocRef = doc(db, "personals", user.uid);
        await setDoc(personalPublicDocRef, { displayName: user.displayName });
    }

    roleModal.classList.add('hidden');
    window.location.reload();
}

async function handleLinkToPersonal() {
    const personalId = document.getElementById('personal-code-input').value.trim();
    if (!personalId) {
        alert("Por favor, insira o código do seu personal.");
        return;
    }
    const personalDocRef = doc(db, "personals", personalId);
    const personalDocSnap = await getDoc(personalDocRef);

    if (personalDocSnap.exists()) {
        const user = auth.currentUser;
        const userDocRef = doc(db, "users", user.uid);
        await setDoc(userDocRef, {
            role: 'aluno',
            personalId,
            displayName: user.displayName,
            email: user.email
        });

        const planDocRef = doc(db, "plans", user.uid);
        await setDoc(planDocRef, { plan: {}, personalId });

        roleModal.classList.add('hidden');
        window.location.reload();
    } else {
        alert("Código do Personal Trainer inválido. Verifique o código e tente novamente.");
    }
}

async function loadStudentsForPersonal(personalId) {
    const q = query(collection(db, "users"), where("personalId", "==", personalId));
    const querySnapshot = await getDocs(q);
    const selector = document.getElementById('student-selector');
    selector.innerHTML = '<option value="">Selecione um aluno</option>';
    querySnapshot.forEach((doc) => {
        selector.innerHTML += `<option value="${doc.id}">${doc.data().displayName}</option>`;
    });
}

function handleStudentSelection(event) {
    const studentId = event.target.value;
    currentUser.selectedStudentId = studentId;
    if (studentId) {
        appContainer.classList.remove('hidden');
        loadWorkoutForStudent(studentId, currentUser.uid);
    } else {
        appContainer.classList.add('hidden');
    }
}

function loadWorkoutForStudent(studentId, personalId) {
    const planDocRef = doc(db, "plans", studentId);
    onSnapshot(planDocRef, (docSnap) => {
        if (docSnap.exists() && docSnap.data().personalId === personalId) {
            currentWorkoutData = docSnap.data().plan || {};
        } else {
            currentWorkoutData = {};
        }
        renderUI();
    });
}

async function saveToFirestore() {
    const studentId = currentUser.role === 'personal' ? currentUser.selectedStudentId : null;
    if (!studentId) return; // Personal só salva se um aluno estiver selecionado
    const docRef = doc(db, "plans", studentId);
    await setDoc(docRef, { plan: currentWorkoutData, personalId: currentUser.uid });
}

function renderUI() {
    tabsContainer.innerHTML = '';
    mainContentContainer.innerHTML = '';
    const isEditable = currentUser.role === 'personal' && currentUser.selectedStudentId;

    Object.keys(currentWorkoutData).forEach(fichaId => {
        const tabGroup = document.createElement('div');
        tabGroup.className = "tab-button-group";
        const tabButton = document.createElement('button');
        tabButton.className = "tab-button flex-1 sm:flex-none text-center py-2 px-4 font-semibold transition-all duration-300";
        tabButton.textContent = fichaId;
        tabButton.id = `btn-${fichaId}`;
        tabButton.onclick = () => showTab(fichaId);
        tabGroup.appendChild(tabButton);
        if (isEditable) {
            const deleteFichaBtn = document.createElement('button');
            deleteFichaBtn.className = "text-red-400 hover:text-red-600 font-bold px-2";
            deleteFichaBtn.innerHTML = '×';
            deleteFichaBtn.title = `Remover ${fichaId}`;
            deleteFichaBtn.onclick = () => deleteFicha(fichaId);
            tabGroup.appendChild(deleteFichaBtn);
        }
        tabsContainer.appendChild(tabGroup);

        const contentDiv = document.createElement('div');
        contentDiv.id = fichaId;
        contentDiv.className = "tab-content";
        mainContentContainer.appendChild(contentDiv);

        renderFichaContent(fichaId, isEditable);
    });

    if (isEditable) {
        const addFichaButton = document.createElement('button');
        addFichaButton.className = "bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors";
        addFichaButton.textContent = "+ Adicionar Ficha";
        addFichaButton.onclick = addFicha;
        tabsContainer.appendChild(addFichaButton);
    }

    const firstFicha = Object.keys(currentWorkoutData)[0];
    if (firstFicha) {
        showTab(firstFicha);
    }
}

function renderFichaContent(fichaId, isEditable) {
    const fichaContainer = document.getElementById(fichaId);
    fichaContainer.innerHTML = '';
    const sections = currentWorkoutData[fichaId];

    for (const sectionTitle in sections) {
        const sectionEl = document.createElement('div');
        let deleteBtnHTML = isEditable ? `<button onclick="deleteSection('${fichaId}', '${sectionTitle}')" class="text-red-500 hover:text-red-700 font-bold p-2 text-xl" title="Remover Seção">×</button>` : '';
        sectionEl.innerHTML = `<div class="section-header"><h2 class="section-title">${sectionTitle}</h2>${deleteBtnHTML}</div>`;
        const exercisesContainer = document.createElement('div');
        exercisesContainer.className = 'space-y-4';

        if (Array.isArray(sections[sectionTitle])) {
            sections[sectionTitle].forEach((ex, index) => {
                exercisesContainer.innerHTML += createExerciseCard(fichaId, sectionTitle, index, ex, isEditable);
            });
        }

        sectionEl.appendChild(exercisesContainer);
        if (isEditable) {
            sectionEl.innerHTML += `<div class="mt-4"><button onclick="openExerciseModal('${fichaId}', '${sectionTitle}')" class="bg-gray-500 text-white py-1 px-3 rounded-md hover:bg-gray-600 text-sm">+ Adicionar Exercício</button></div>`;
        }
        fichaContainer.appendChild(sectionEl);
    }

    if (isEditable) {
        const addSectionButton = document.createElement('button');
        addSectionButton.className = "mt-6 bg-indigo-500 text-white py-2 px-4 rounded-md hover:bg-indigo-600";
        addSectionButton.textContent = "+ Adicionar Seção";
        addSectionButton.onclick = () => addSection(fichaId);
        fichaContainer.appendChild(addSectionButton);
    }
}

function createExerciseCard(fichaId, sectionTitle, index, ex, isEditable) {
    let deleteBtnHTML = isEditable ? `<button onclick="deleteExercise('${fichaId}', '${sectionTitle}', ${index})" class="delete-btn" title="Excluir exercício">&times;</button>` : '';
    return `
                <div class="exercise-card">
                    <div class="flex-shrink-0 bg-gray-200 p-3 rounded-full"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.25278C12 6.25278 10.7528 5 9.49998 5C7.49998 5 6.25278 6.25278 6.25278 7.50002C6.25278 8.74722 7.49998 10 9.49998 10C10.7528 10 12 8.74722 12 8.74722m1.5-4.74722C13.5 3.00556 14.7472 2 16.5 2c2 0 3.2472 1.25278 3.2472 2.50002C19.7472 6.24722 18.5 7.5 16.5 7.5c-1.2472 0-2.5-1.25278-2.5-2.24722zM12 17.7472c0 0-1.2472 1.2528-2.50002 1.2528C7.49998 19 6.25278 17.7472 6.25278 16.5c0-1.2472 1.2472-2.50002 2.2472-2.50002C9.2472 14 12 17.7472 12 17.7472zm1.5 4.7528c0 0 1.2472-1.2528 2.5-1.2528 2 0 3.2472 1.2528 3.2472 2.5 0 1.2472-1.2472 2.50002-2.2472 2.50002-1 0-2.5-1.2528-2.5-2.50002zM3 12h18"></path></svg></div>
                    <div class="flex-1"><h3 class="font-semibold">${ex.name}</h3><p class="text-sm text-gray-500">${ex.details}</p></div>
                    <button onclick="openModal('${ex.video}')" class="bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 mr-6">Ver Vídeo</button>
                    ${deleteBtnHTML}
                </div>`;
}

// Make functions globally available
Object.assign(window, {
    showTab: (tabId) => {
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById(tabId)?.classList.add('active');
        document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
        document.getElementById(`btn-${tabId}`)?.classList.add('active');
    },
    addFicha: () => {
        const name = prompt("Nome da nova ficha:");
        if (name && !currentWorkoutData[name]) {
            currentWorkoutData[name] = {};
            renderUI();
            saveToFirestore();
        }
    },
    deleteFicha: (fichaId) => {
        if (confirm(`Remover a ficha "${fichaId}"?`)) {
            delete currentWorkoutData[fichaId];
            renderUI();
            saveToFirestore();
        }
    },
    addSection: (fichaId) => {
        const name = prompt("Nome da nova seção:");
        if (name && !currentWorkoutData[fichaId][name]) {
            currentWorkoutData[fichaId][name] = [];
            renderFichaContent(fichaId, true);
            saveToFirestore();
        }
    },
    deleteSection: (fichaId, sectionTitle) => {
        if (confirm(`Remover a seção "${sectionTitle}"?`)) {
            delete currentWorkoutData[fichaId][sectionTitle];
            renderFichaContent(fichaId, true);
            saveToFirestore();
        }
    },
    openExerciseModal: (fichaId, sectionTitle) => {
        exerciseModal.dataset.fichaId = fichaId;
        exerciseModal.dataset.sectionTitle = sectionTitle;
        exerciseModal.classList.remove('hidden');
        exerciseModal.classList.add('flex');
    },
    saveNewExercise: () => {
        const { fichaId, sectionTitle } = exerciseModal.dataset;
        const newEx = {
            name: document.getElementById('new-exercise-name').value,
            details: document.getElementById('new-exercise-details').value,
            video: document.getElementById('new-exercise-video').value
        };
        if (!newEx.name) return alert("O nome é obrigatório.");
        currentWorkoutData[fichaId][sectionTitle].push(newEx);
        renderFichaContent(fichaId, true);
        closeModal('exerciseModal');
        saveToFirestore();
    },
    deleteExercise: (fichaId, sectionTitle, index) => {
        currentWorkoutData[fichaId][sectionTitle].splice(index, 1);
        renderFichaContent(fichaId, true);
        saveToFirestore();
    },
    openModal: (url) => {
        const videoModal = document.getElementById('videoModal');
        const iframe = document.getElementById('videoFrame');
        let videoId;
        if (url.includes('shorts/')) videoId = url.split('shorts/')[1].split('?')[0];
        else videoId = new URL(url).searchParams.get('v');

        if (videoId) {
            iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
            videoModal.classList.remove('hidden');
            videoModal.classList.add('flex');
        }
    },
    closeModal: (modalId) => {
        document.getElementById(modalId).classList.add('hidden');
        if (modalId === 'videoModal') document.getElementById('videoFrame').src = '';
    }
});
