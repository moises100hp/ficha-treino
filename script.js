import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithRedirect, getRedirectResult, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, onSnapshot, collection, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', initializeAppAndAuth);

function initializeAppAndAuth() {
    let app, auth, db;
    try {
        if (!firebaseConfig.apiKey || firebaseConfig.apiKey.includes("SUA_CHAVE_AQUI")) {
            throw new Error("Configuração do Firebase inválida. Por favor, cole suas credenciais.");
        }
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
    } catch (e) {
        console.error("Erro ao inicializar o Firebase:", e);
        document.body.innerHTML = `<div class="text-red-500 text-center p-8">${e.message}</div>`;
        return;
    }

    let currentUser = { uid: null, role: null, personalId: null, selectedStudentId: null };
    let currentWorkoutData = { fichas: [] };
    let unsubscribePlanListener;

    const loginButton = document.getElementById('login-button');
    const logoutButton = document.getElementById('logout-button');
    const userInfo = document.getElementById('user-info');
    const userNameEl = document.getElementById('user-name');
    const appContainer = document.getElementById('app-container');
    const tabsContainer = document.getElementById('tabs-container');
    const mainContentContainer = document.getElementById('main-content-container');
    const exerciseModal = document.getElementById('exerciseModal');
    const bulkCreateModal = document.getElementById('bulk-create-modal');
    const roleModal = document.getElementById('role-modal');
    const studentSelector = document.getElementById('student-selector');

    const provider = new GoogleAuthProvider();

    loginButton.addEventListener('click', () => signInWithRedirect(auth, provider));
    logoutButton.addEventListener('click', () => signOut(auth));
    document.getElementById('aluno-btn').addEventListener('click', () => {
        document.getElementById('role-choice-buttons').classList.add('hidden');
        document.getElementById('personal-code-input-div').classList.remove('hidden');
    });
    document.getElementById('personal-btn').addEventListener('click', () => handleRoleSelection('personal'));
    document.getElementById('link-personal-btn').addEventListener('click', handleLinkToPersonal);
    studentSelector.addEventListener('change', handleStudentSelection);
    document.getElementById('bulk-add-btn')?.addEventListener('click', openBulkCreateModal);

    getRedirectResult(auth).catch(error => {
        console.error("Erro no redirecionamento:", error);
        if (error.code === 'auth/unauthorized-domain') {
            showErrorNotification(
                `O domínio <strong>${window.location.hostname}</strong> não está autorizado.`,
                `Vá para o console do Firebase, em Authentication > Settings > Authorized domains, e adicione este domínio.`
            );
        }
    });

    onAuthStateChanged(auth, async user => {
        if (user) {
            const userDocRef = doc(db, "users", user.uid);
            const userDocSnap = await getDoc(userDocRef);

            if (userDocSnap.exists()) {
                const userData = userDocSnap.data();
                currentUser = { uid: user.uid, ...userData };

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
        await setDoc(doc(db, "users", user.uid), { role, displayName: user.displayName, email: user.email });
        if (role === 'personal') {
            await setDoc(doc(db, "personals", user.uid), { displayName: user.displayName });
        }
        roleModal.classList.add('hidden');
        window.location.reload();
    }

    async function handleLinkToPersonal() {
        const personalId = document.getElementById('personal-code-input').value.trim();
        if (!personalId) return alert("Por favor, insira o código do seu personal.");

        const personalPublicDocRef = doc(db, "personals", personalId);
        const personalPublicSnap = await getDoc(personalPublicDocRef);

        if (personalPublicSnap.exists()) {
            const user = auth.currentUser;
            await setDoc(doc(db, "users", user.uid), {
                role: 'aluno', personalId, displayName: user.displayName, email: user.email
            });

            const studentLinkRef = doc(db, "personals", personalId, "students", user.uid);
            await setDoc(studentLinkRef, { name: user.displayName });

            await setDoc(doc(db, "plans", user.uid), { plan: { fichas: [] }, personalId });
            roleModal.classList.add('hidden');
            window.location.reload();
        } else {
            alert("Código do Personal Trainer inválido.");
        }
    }

    function loadStudentsForPersonal(personalId) {
        const studentsCollRef = collection(db, "personals", personalId, "students");
        onSnapshot(studentsCollRef, (querySnapshot) => {
            studentSelector.innerHTML = '<option value="">Selecione um aluno</option>';
            querySnapshot.forEach((doc) => {
                studentSelector.innerHTML += `<option value="${doc.id}">${doc.data().name}</option>`;
            });
        }, (error) => {
            console.error("Erro ao carregar alunos:", error);
            alert("Não foi possível carregar a lista de alunos. Verifique as permissões do Firestore.");
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
        if (unsubscribePlanListener) unsubscribePlanListener();

        unsubscribePlanListener = onSnapshot(planDocRef, (docSnap) => {
            if (docSnap.exists() && docSnap.data().personalId === personalId) {
                currentWorkoutData = docSnap.data().plan || { fichas: [] };
            } else {
                currentWorkoutData = { fichas: [] };
            }
            renderUI();
        });
    }

    async function saveToFirestore() {
        const studentId = currentUser.role === 'personal' ? currentUser.selectedStudentId : null;
        if (!studentId) return;
        const docRef = doc(db, "plans", studentId);
        await setDoc(docRef, { plan: currentWorkoutData, personalId: currentUser.uid }, { merge: true });
    }

    function renderUI() {
        tabsContainer.innerHTML = '';
        mainContentContainer.innerHTML = '';
        const isEditable = currentUser.role === 'personal' && currentUser.selectedStudentId;

        (currentWorkoutData.fichas || []).forEach(ficha => {
            const tabGroup = document.createElement('div');
            tabGroup.className = "tab-button-group";
            const tabButton = document.createElement('button');
            tabButton.className = "tab-button flex-1 sm:flex-none text-center py-2 px-4 font-semibold transition-all duration-300";
            tabButton.textContent = ficha.name;
            tabButton.id = `btn-${ficha.id}`;
            tabButton.onclick = () => showTab(ficha.id);
            tabGroup.appendChild(tabButton);
            if (isEditable) {
                const deleteFichaBtn = document.createElement('button');
                deleteFichaBtn.className = "text-red-400 hover:text-red-600 font-bold px-2";
                deleteFichaBtn.innerHTML = '×';
                deleteFichaBtn.title = `Remover ${ficha.name}`;
                deleteFichaBtn.onclick = () => deleteFicha(ficha.id);
                tabGroup.appendChild(deleteFichaBtn);
            }
            tabsContainer.appendChild(tabGroup);

            const contentDiv = document.createElement('div');
            contentDiv.id = ficha.id;
            contentDiv.className = "tab-content";
            mainContentContainer.appendChild(contentDiv);

            renderFichaContent(ficha.id, isEditable);
        });

        if (isEditable) {
            const addFichaButton = document.createElement('button');
            addFichaButton.className = "bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors";
            addFichaButton.textContent = "+ Adicionar Ficha";
            addFichaButton.onclick = addFicha;

            const bulkAddButton = document.createElement('button');
            bulkAddButton.className = "ml-4 bg-yellow-500 text-black py-2 px-4 rounded-lg font-medium hover:bg-yellow-600 transition-colors";
            bulkAddButton.textContent = "Criar Ficha em Massa";
            bulkAddButton.onclick = openBulkCreateModal;

            tabsContainer.appendChild(addFichaButton);
            tabsContainer.appendChild(bulkAddButton);
        }

        if (currentWorkoutData.fichas && currentWorkoutData.fichas.length > 0) {
            showTab(currentWorkoutData.fichas[0].id);
        }
    }

    function renderFichaContent(fichaId, isEditable) {
        const ficha = currentWorkoutData.fichas.find(f => f.id === fichaId);
        if (!ficha) return;

        const fichaContainer = document.getElementById(fichaId);
        fichaContainer.innerHTML = '';
        const sections = ficha.sections || [];

        sections.forEach((section, index) => {
            const sectionEl = document.createElement('div');

            let moveButtonsHTML = '';
            if (isEditable) {
                const upArrow = index > 0 ? `<button class="arrow-btn" onclick="moveSection('${fichaId}', '${section.title}', 'up')">▲</button>` : `<span class="arrow-btn opacity-25">▲</span>`;
                const downArrow = index < sections.length - 1 ? `<button class="arrow-btn" onclick="moveSection('${fichaId}', '${section.title}', 'down')">▼</button>` : `<span class="arrow-btn opacity-25">▼</span>`;
                moveButtonsHTML = `<div class="flex flex-col">${upArrow}${downArrow}</div>`;
            }

            let deleteBtnHTML = isEditable ? `<button onclick="deleteSection('${fichaId}', '${section.title}')" class="text-red-500 hover:text-red-700 font-bold p-2 text-xl" title="Remover Seção">×</button>` : '';
            sectionEl.innerHTML = `<div class="section-header"><div class="flex items-center">${moveButtonsHTML}<h2 class="section-title ml-2">${section.title}</h2></div>${deleteBtnHTML}</div>`;
            const exercisesContainer = document.createElement('div');
            exercisesContainer.className = 'space-y-4';

            if (Array.isArray(section.exercises)) {
                section.exercises.forEach((ex, exIndex) => {
                    exercisesContainer.innerHTML += createExerciseCard(fichaId, section.title, exIndex, ex, isEditable);
                });
            }

            sectionEl.appendChild(exercisesContainer);
            if (isEditable) {
                sectionEl.innerHTML += `<div class="mt-4"><button onclick="openExerciseModal('${fichaId}', '${section.title}')" class="bg-gray-500 text-white py-1 px-3 rounded-md hover:bg-gray-600 text-sm">+ Adicionar Exercício</button></div>`;
            }
            fichaContainer.appendChild(sectionEl);
        });

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
        showTab, addFicha, deleteFicha, addSection, deleteSection, moveSection,
        openExerciseModal, saveNewExercise, deleteExercise, openModal, closeModal,
        openBulkCreateModal, handleBulkCreate
    });

    function showTab(tabId) {
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById(tabId)?.classList.add('active');
        document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
        document.getElementById(`btn-${tabId}`)?.parentElement.querySelector('.tab-button').classList.add('active');
    }

    function addFicha() {
        const name = prompt("Nome da nova ficha:");
        if (name && !currentWorkoutData.fichas.find(f => f.name === name)) {
            currentWorkoutData.fichas.push({ id: `ficha-${Date.now()}`, name, sections: [] });
            renderUI();
            saveToFirestore();
        }
    }

    function deleteFicha(fichaId) {
        if (confirm(`Remover a ficha?`)) {
            currentWorkoutData.fichas = currentWorkoutData.fichas.filter(f => f.id !== fichaId);
            renderUI();
            saveToFirestore();
        }
    }

    function addSection(fichaId) {
        const name = prompt("Nome da nova seção:");
        const ficha = currentWorkoutData.fichas.find(f => f.id === fichaId);
        if (name && ficha && !ficha.sections.find(s => s.title === name)) {
            ficha.sections.push({ title: name, exercises: [] });
            renderFichaContent(fichaId, true);
            saveToFirestore();
        }
    }

    function deleteSection(fichaId, sectionTitle) {
        const ficha = currentWorkoutData.fichas.find(f => f.id === fichaId);
        if (ficha && confirm(`Remover a seção "${sectionTitle}"?`)) {
            ficha.sections = ficha.sections.filter(s => s.title !== sectionTitle);
            renderFichaContent(fichaId, true);
            saveToFirestore();
        }
    }

    function moveSection(fichaId, sectionTitle, direction) {
        const ficha = currentWorkoutData.fichas.find(f => f.id === fichaId);
        if (!ficha) return;
        const sections = ficha.sections;
        const currentIndex = sections.findIndex(s => s.title === sectionTitle);
        const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

        if (newIndex < 0 || newIndex >= sections.length) return;

        [sections[currentIndex], sections[newIndex]] = [sections[newIndex], sections[currentIndex]];
        renderFichaContent(fichaId, true);
        saveToFirestore();
    }

    function openExerciseModal(fichaId, sectionTitle) {
        exerciseModal.dataset.fichaId = fichaId;
        exerciseModal.dataset.sectionTitle = sectionTitle;
        document.getElementById('new-exercise-name').value = '';
        document.getElementById('new-exercise-details').value = '';
        document.getElementById('new-exercise-video').value = '';
        exerciseModal.classList.remove('hidden');
        exerciseModal.classList.add('flex');
    }

    function saveNewExercise() {
        const { fichaId, sectionTitle } = exerciseModal.dataset;
        const newEx = {
            name: document.getElementById('new-exercise-name').value,
            details: document.getElementById('new-exercise-details').value,
            video: document.getElementById('new-exercise-video').value
        };
        if (!newEx.name) return alert("O nome é obrigatório.");
        const ficha = currentWorkoutData.fichas.find(f => f.id === fichaId);
        const section = ficha?.sections.find(s => s.title === sectionTitle);
        if (section) {
            section.exercises.push(newEx);
            renderFichaContent(fichaId, true);
            closeModal('exerciseModal');
            saveToFirestore();
        }
    }

    function deleteExercise(fichaId, sectionTitle, index) {
        const ficha = currentWorkoutData.fichas.find(f => f.id === fichaId);
        const section = ficha?.sections.find(s => s.title === sectionTitle);
        if (section) {
            section.exercises.splice(index, 1);
            renderFichaContent(fichaId, true);
            saveToFirestore();
        }
    }

    function openModal(url) {
        const videoModal = document.getElementById('videoModal');
        const iframe = document.getElementById('videoFrame');
        let videoId;
        try {
            if (url.includes('shorts/')) videoId = url.split('/shorts/')[1].split('?')[0];
            else videoId = new URL(url).searchParams.get('v');
            if (videoId) {
                iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
                videoModal.classList.remove('hidden');
                videoModal.classList.add('flex');
            }
        } catch (e) { console.error('URL de vídeo inválida:', url, e); }
    }

    function closeModal(modalId) {
        document.getElementById(modalId).classList.add('hidden');
        if (modalId === 'videoModal') document.getElementById('videoFrame').src = '';
    }

    function openBulkCreateModal() {
        bulkCreateModal.classList.remove('hidden');
        bulkCreateModal.classList.add('flex');
    }

    function handleBulkCreate() {
        const text = document.getElementById('bulk-text-input').value;
        const lines = text.split('\n').map(l => l.trim()).filter(l => l);

        const newPlanData = { fichas: [] };
        let currentFicha = null;
        let currentSection = null;
        const youtubeRegex = /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\S*$/i;

        lines.forEach(line => {
            if (line.startsWith('## ')) {
                const fichaName = line.substring(3).trim();
                currentFicha = { id: `ficha-${Date.now()}-${Math.random()}`, name: fichaName, sections: [] };
                newPlanData.fichas.push(currentFicha);
                currentSection = null;
            } else if (line.startsWith('# ')) {
                if (!currentFicha) {
                    currentFicha = { id: `ficha-${Date.now()}`, name: "Nova Ficha", sections: [] };
                    newPlanData.fichas.push(currentFicha);
                }
                const sectionName = line.substring(2).trim();
                currentSection = { title: sectionName, exercises: [] };
                currentFicha.sections.push(currentSection);

            } else if (youtubeRegex.test(line)) {
                if (currentSection && currentSection.exercises.length > 0) {
                    currentSection.exercises[currentSection.exercises.length - 1].video = line;
                }
            } else {
                if (currentSection) {
                    const matchEx = line.match(/^(.+?)(?:\s*[-–]\s*|\s+)(\d+\s*[xX]\s*\d+(?:-\d+)?)$/);
                    let name = line;
                    let details = 'A definir';
                    if (matchEx) {
                        name = matchEx[1].trim();
                        details = matchEx[2].trim();
                    }

                    currentSection.exercises.push({ name, details, video: '' });
                }
            }
        });

        if (newPlanData.fichas.length === 0) {
            return alert("Nenhuma ficha foi criada. Verifique o texto e o formato (## para fichas, # para seções).");
        }

        currentWorkoutData = newPlanData;
        renderUI();
        saveToFirestore();
        closeModal('bulk-create-modal');
    }

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal('videoModal');
            closeModal('exerciseModal');
            closeModal('bulk-create-modal');
            closeModal('role-modal');
        }
    });

    function showErrorNotification(title, message) {
        const errorContainer = document.getElementById('error-notification');
        const errorMessageEl = document.getElementById('error-message');
        errorMessageEl.innerHTML = `<p>${title}</p><p class="text-xs mt-2">${message}</p>`;
        errorContainer.classList.remove('hidden');
    }

    window.hideErrorNotification = function () {
        document.getElementById('error-notification').classList.add('hidden');
    }
}
