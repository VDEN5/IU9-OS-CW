export class UIManager {
    constructor() {
        this.elements = {
            connectionStatus: document.getElementById('connectionStatus'),
            clientCount: document.getElementById('clientCount'),
            camerasList: document.getElementById('camerasList'),
            eventsTable: document.getElementById('eventsTable'),
            systemInfo: document.getElementById('systemInfoContainer'),
            authBlock: document.getElementById('authBlock'),
            modal: document.getElementById('photoModal'),
            modalImage: document.getElementById('modalImage'),
            modalTitle: document.getElementById('modalTitle'),
            modalCameraName: document.getElementById('modalCameraName'),
            modalTimestamp: document.getElementById('modalTimestamp'),
            modalType: document.getElementById('modalType'),
            historyModal: document.getElementById('historyModal'),
            historyTable: document.getElementById('historyTable'),
            showHistoryBtn: document.getElementById('showHistoryBtn'),
            clearHistoryBtn: document.getElementById('clearHistory'),
            filterAll: document.getElementById('filterAll'),
            filterFires: document.getElementById('filterFires'),
            filterConnections: document.getElementById('filterConnections')
        };
        this.setupModalClose();
    }

    setupModalClose() {
        const closeBtns = document.querySelectorAll('.close');
        closeBtns.forEach(btn => {
            btn.onclick = () => this.closeAllModals();
        });
        window.onclick = (e) => {
            if (e.target === this.elements.modal) this.closeModal();
            if (e.target === this.elements.historyModal) this.closeHistoryModal();
        };
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.closeAllModals();
        });
    }

    closeAllModals() {
        this.closeModal();
        this.closeHistoryModal();
    }

    closeModal() {
        this.elements.modal.style.display = 'none';
        document.body.style.overflow = 'auto';
        this.elements.modalImage.src = '';
    }

    closeHistoryModal() {
        this.elements.historyModal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }

    showModal(photoData, cameraName, timestamp, type) {
        this.elements.modalImage.src = `data:image/jpeg;base64,${photoData}`;
        this.elements.modalTitle.textContent = `Фото с ${cameraName}`;
        this.elements.modalCameraName.textContent = cameraName;
        this.elements.modalTimestamp.textContent = new Date(timestamp).toLocaleString();
        this.elements.modalType.textContent = type === 'requested' ? 'По запросу' : (type === 'history' ? 'Из истории' : 'Автоматически');
        this.elements.modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }

    setConnectionStatus(connected) {
        const el = this.elements.connectionStatus;
        if (connected) {
            el.textContent = 'Подключено';
            el.className = 'status-online';
        } else {
            el.textContent = 'Отключено';
            el.className = 'status-offline';
        }
    }

    updateCamerasList(cameras, onRequestPhoto, onFocusCamera, activeAnimations, eventsHistory) {
        const onlineCount = cameras.filter(c => c.status === 'online').length;
        this.elements.clientCount.textContent = `${onlineCount}/${cameras.length}`;

        const hasRecentFire = (camera) => eventsHistory.some(e =>
            e.cameraName === camera.name && e.type === 'fire' &&
            (Date.now() - new Date(e.timestamp).getTime() < 300000)
        );

        this.elements.camerasList.innerHTML = cameras.map(cam => {
            const isFire = activeAnimations.has(cam.id) || hasRecentFire(cam);
            const borderColor = isFire ? '#e74c3c' : (cam.status === 'online' ? '#27ae60' : '#95a5a6');
            return `
            <div class="client-card ${cam.status === 'online' ? 'online' : 'offline'} ${isFire ? 'camera-active' : ''}" 
                 data-camera-id="${cam.id}"
                 onclick="window.app.focusCamera('${cam.id}')"
                 style="cursor:pointer; border-left:4px solid ${borderColor}">
                <div class="client-header">
                    <span class="connection-dot ${cam.status === 'online' ? 'connected' : 'disconnected'} ${isFire ? 'pulsing' : ''}"></span>
                    <strong>${cam.name}</strong>
                    <span class="client-id">${cam.id}</span>
                </div>
                <div class="client-info">
                    <div><strong>Регион:</strong> ${cam.location}</div>
                    <div><strong>Статус:</strong> ${cam.status === 'online' ? '🟢 Онлайн' : '🔴 Офлайн'}</div>
                    ${cam.status === 'online' ? `
                        <div><strong>IP:</strong> ${cam.ip}</div>
                        <div><strong>Подключена:</strong> ${new Date(cam.connectedAt).toLocaleTimeString()}</div>
                    ` : ''}
                    <div><strong>Координаты:</strong> ${cam.coords[0].toFixed(4)}, ${cam.coords[1].toFixed(4)}</div>
                    ${isFire ? '<div style="color:#e74c3c;font-weight:bold;">🔥 Обнаружен пожар</div>' : ''}
                </div>
                <button class="request-btn" 
                    onclick="event.stopPropagation(); window.app.requestPhoto('${cam.id}')"
                    ${cam.status !== 'online' ? 'disabled' : ''}>
                    ${cam.status === 'online' ? '📸 Запросить фото' : '🔴 Недоступна'}
                </button>
            </div>`;
        }).join('');
    }

    updateEventsTable(events, onPhotoClick, onDeleteClick) {
        if (!events.length) {
            this.elements.eventsTable.innerHTML = '<tr><td colspan="5" class="empty-state">События появятся здесь</td></tr>';
            return;
        }
        this.elements.eventsTable.innerHTML = events.map(ev => {
            const typeClass = this.getEventTypeClass(ev.type);
            const typeText = this.getEventTypeText(ev.type);
            return `
            <tr>
                <td>${new Date(ev.timestamp).toLocaleTimeString()}</td>
                <td><strong>${ev.cameraName || 'Система'}</strong></td>
                <td><span class="event-type ${typeClass}">${typeText}</span></td>
                <td>${ev.details || ''}</td>
                <td style="white-space:nowrap;">
                    ${ev.photoData ? `<img src="data:image/jpeg;base64,${ev.photoData}" class="event-photo" onclick="event.stopPropagation(); window.app.showEventPhoto('${ev.id}')" alt="Фото">` : '<span style="color:#95a5a6;">—</span>'}
                    <button class="delete-event-btn" onclick="event.stopPropagation(); window.app.deleteEvent(${ev.id})" title="Удалить">🗑️</button>
                </td>
            </tr>`;
        }).join('');
    }

    getEventTypeClass(type) {
        const map = { fire:'event-fire', connection:'event-connection', disconnection:'event-disconnection', message:'event-message', photo_request:'event-photo' };
        return map[type] || 'event-message';
    }
    getEventTypeText(type) {
        const map = { fire:'🔥 ПОЖАР', connection:'✅ ПОДКЛЮЧЕНИЕ', disconnection:'❌ ОТКЛЮЧЕНИЕ', message:'💬 СООБЩЕНИЕ', photo_request:'📸 ЗАПРОС ФОТО' };
        return map[type] || type;
    }

    updateSystemInfo(data) {
        if (!this.elements.systemInfo) return;
        const { models, types, addresses, departments, stats } = data;
        this.elements.systemInfo.innerHTML = `
            <div class="info-card"><h4>📷 Модели камер <span class="stats-badge">${models.length}</span></h4><ul>${models.map(m => `<li><strong>${m.name}</strong> — ${m.manufacturer || '—'}</li>`).join('') || '<li>Нет данных</li>'}</ul></div>
            <div class="info-card"><h4>🔍 Типы камер <span class="stats-badge">${types.length}</span></h4><ul>${types.map(t => `<li><strong>${t.name}</strong> (дальность ${t.range || '?'} м)</li>`).join('') || '<li>Нет данных</li>'}</ul></div>
            <div class="info-card"><h4>📍 Адреса <span class="stats-badge">${addresses.length}</span></h4><ul>${addresses.map(a => `<li>${a.region}, ${a.city} (${a.coordinates || 'координаты не указаны'})</li>`).join('') || '<li>Нет данных</li>'}</ul></div>
            <div class="info-card"><h4>🏢 Департаменты <span class="stats-badge">${departments.length}</span></h4><ul>${departments.map(d => `<li><strong>${d.name}</strong> — ${d.phone || 'тел. не указан'}</li>`).join('') || '<li>Нет данных</li>'}</ul></div>
            <div class="info-card"><h4>📊 Статистика по моделям</h4><ul>${stats.byModel?.map(s => `<li>${s.model_name}: ${s.camera_count} камер (онлайн: ${s.online_count})</li>`).join('') || '<li>Нет данных</li>'}</ul></div>
            <div class="info-card"><h4>📊 Статистика по типам</h4><ul>${stats.byType?.map(t => `<li>${t.type_name}: ${t.camera_count} камер, ср. дальность ${Math.round(t.avg_range)} м</li>`).join('') || '<li>Нет данных</li>'}</ul></div>
        `;
    }

    updateAuthUI(user, onLogout) {
        const block = this.elements.authBlock;
        if (!block) return;
        if (user) {
            block.innerHTML = `
                <div class="user-info">
                    <span class="user-greeting">👤 ${user.name}</span>
                    <span class="user-position">${user.position}</span>
                    <button onclick="window.app.logout()" class="logout-btn-small" title="Выйти">🚪</button>
                </div>
            `;
        } else {
            block.innerHTML = `<a href="/login-modal.html" class="login-btn-small">🔐 Войти</a>`;
        }
    }
}