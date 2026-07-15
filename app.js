const personnel = ["김통신", "박가설", "이무선", "최정비", "정체계"];
const MIN_PERSONNEL = 3; 

let state = JSON.parse(localStorage.getItem('combatLeaveState')) || {
    points: { "김통신": 0, "박가설": 0, "이무선": 0, "최정비": 0, "정체계": 0 },
    events: [] 
};

function saveData() {
    localStorage.setItem('combatLeaveState', JSON.stringify(state));
    renderPersonnel();
    if(calendar) calendar.refetchEvents();
}

let calendar;

// 💡 탭 전환 함수 (모바일 하단 네비게이션용)
function switchTab(tabId, navElement) {
    // 모든 탭 숨기기
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    // 모든 네비 버튼 비활성화
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    
    // 선택된 탭과 버튼 활성화
    document.getElementById(tabId).classList.add('active');
    if(navElement) navElement.classList.add('active');

    // 캘린더 탭으로 돌아올 때 달력 크기 재조정 (깨짐 방지)
    if(tabId === 'tab-calendar' && calendar) {
        setTimeout(() => { calendar.render(); }, 100);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    renderPersonnel();
    populateSelectBoxes();

    let calendarEl = document.getElementById('calendar');
    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'ko',
        height: 'auto', // 모바일 스크롤에 맞춤
        headerToolbar: {
            left: 'prev',
            center: 'title',
            right: 'next'
        },
        events: function(info, successCallback, failureCallback) {
            let allEvents = [...state.events];
            let start = new Date(info.start);
            let end = new Date(info.end);
            for(let d = start; d < end; d.setDate(d.getDate() + 1)) {
                let day = d.getDay();
                if(day === 3 || day === 5) {
                    allEvents.push({
                        title: '오후 휴식', // 모바일에선 글자를 짧게
                        start: d.toISOString().split('T')[0],
                        className: 'event-rest'
                    });
                }
            }
            successCallback(allEvents);
        }
    });
    calendar.render();

    document.getElementById('duty-form').addEventListener('submit', function(e) {
        e.preventDefault();
        const date = document.getElementById('duty-date').value;
        const person = document.getElementById('duty-person').value;
        const type = document.getElementById('duty-type').value;

        if(addDuty(date, person, type)) {
            // 성공 시 캘린더 탭으로 자동 이동
            document.getElementById('duty-form').reset();
            switchTab('tab-calendar', document.querySelector('.nav-item:nth-child(1)'));
        }
    });

    document.getElementById('leave-form').addEventListener('submit', function(e) {
        e.preventDefault();
        const date = document.getElementById('leave-date').value;
        const person = document.getElementById('leave-person').value;
        const type = document.getElementById('leave-type').value;

        if(requestLeave(date, person, type)) {
            // 성공 시 캘린더 탭으로 자동 이동
            document.getElementById('leave-form').reset();
            switchTab('tab-calendar', document.querySelector('.nav-item:nth-child(1)'));
        }
    });

    document.getElementById('reset-btn').addEventListener('click', () => {
        if(confirm("모든 데이터를 초기화하시겠습니까?")) {
            localStorage.removeItem('combatLeaveState');
            location.reload();
        }
    });
});

function renderPersonnel() {
    const list = document.getElementById('personnel-list');
    list.innerHTML = '';
    personnel.forEach(p => {
        list.innerHTML += `<li><span>${p}</span> <strong>${state.points[p] || 0} 개</strong></li>`;
    });
}

function populateSelectBoxes() {
    const dutySelect = document.getElementById('duty-person');
    const leaveSelect = document.getElementById('leave-person');
    personnel.forEach(p => {
        dutySelect.innerHTML += `<option value="${p}">${p}</option>`;
        leaveSelect.innerHTML += `<option value="${p}">${p}</option>`;
    });
}

function addDuty(date, person, type) {
    const d = new Date(date);
    const day = d.getDay(); 

    if (type === 'day' && day >= 1 && day <= 5) {
        alert("평일 주간 당직은 없습니다.");
        return false;
    }

    state.events.push({
        id: Date.now().toString(),
        title: `[당직]${person}(${type === 'day' ? '주' : '야'})`,
        start: date,
        className: 'event-duty'
    });

    let earned = false;
    if ((day === 5 && type === 'night') || (day === 6) || (day === 0 && type === 'day')) {
        state.points[person] = (state.points[person] || 0) + 1;
        earned = true;
    }

    if ((day >= 1 && day <= 5 && type === 'night') || (day === 0 && type === 'night')) {
        let nextDay = new Date(d);
        nextDay.setDate(nextDay.getDate() + 1);
        let nextDayStr = nextDay.toISOString().split('T')[0];
        
        state.events.push({
            id: Date.now().toString() + "-sleep",
            title: `[근무취침]${person}`,
            start: nextDayStr,
            className: 'event-sleep',
            type: 'sleep',
            person: person
        });
        alert(`${person} 당직 등록 완료!\n${earned ? '전투휴무 1개를 획득했습니다.\n' : ''}다음날(${nextDayStr}) 근무취침이 부여되었습니다.`);
    } else {
        alert(`${person} 당직 등록 완료!\n${earned ? '전투휴무 1개를 획득했습니다.' : ''}`);
    }

    saveData();
    return true; // 성공 시 true 반환
}

function requestLeave(date, person, type) {
    const d = new Date(date);
    const day = d.getDay();

    const requiredPoints = type === 'full' ? 1 : 0.5;
    if ((state.points[person] || 0) < requiredPoints) {
        alert(`마일리지가 부족합니다. (보유: ${state.points[person]}, 필요: ${requiredPoints})`);
        return false;
    }

    if ((day === 3 || day === 5) && type === 'pm') {
        alert("수/금요일 오후는 부대 휴식입니다. 종일을 쉴 경우 '오전 반투'만 신청하세요.");
        return false;
    }

    if (!checkMinPersonnel(date, type)) {
        alert(`❌ 출근 인원 부족! 해당 날짜에 휴무를 사용할 수 없습니다. (최소 ${MIN_PERSONNEL}명 필요)`);
        return false;
    }

    state.points[person] -= requiredPoints;
    
    let titleStr = type === 'full' ? '종일' : (type === 'am' ? '오전' : '오후');
    state.events.push({
        id: Date.now().toString(),
        title: `[휴무-${titleStr}]${person}`,
        start: date,
        className: 'event-leave',
        type: 'leave',
        leaveType: type,
        person: person
    });

    alert(`${person}의 ${date} 전투휴무(${titleStr})가 승인되었습니다.`);
    saveData();
    return true;
}

function checkMinPersonnel(date, newLeaveType) {
    let amAbsentees = 0; 
    let pmAbsentees = 0; 
    const total = personnel.length;

    let dayEvents = state.events.filter(e => e.start === date);

    dayEvents.forEach(e => {
        if (e.type === 'sleep') {
            amAbsentees++; pmAbsentees++; 
        } else if (e.type === 'leave') {
            if (e.leaveType === 'full') { amAbsentees++; pmAbsentees++; }
            if (e.leaveType === 'am') { amAbsentees++; }
            if (e.leaveType === 'pm') { pmAbsentees++; }
        }
    });

    if (newLeaveType === 'full') { amAbsentees++; pmAbsentees++; }
    if (newLeaveType === 'am') { amAbsentees++; }
    if (newLeaveType === 'pm') { pmAbsentees++; }

    const d = new Date(date);
    const day = d.getDay();
    if (day === 3 || day === 5) {
        pmAbsentees = 0; 
    }

    if ((total - amAbsentees) < MIN_PERSONNEL || (total - pmAbsentees) < MIN_PERSONNEL) {
        return false;
    }
    return true;
}
