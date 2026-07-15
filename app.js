// 초기 인원 설정 (필요시 이름 수정)
const personnel = ["김통신", "박가설", "이무선", "최정비", "정체계"];
const MIN_PERSONNEL = 3; // 최소 출근 인원

// 데이터 상태 (LocalStorage 연동)
let state = JSON.parse(localStorage.getItem('combatLeaveState')) || {
    points: { "김통신": 0, "박가설": 0, "이무선": 0, "최정비": 0, "정체계": 0 },
    events: [] // 당직, 휴무, 근무취침 데이터
};

// 저장 함수
function saveData() {
    localStorage.setItem('combatLeaveState', JSON.stringify(state));
    renderPersonnel();
    calendar.refetchEvents();
}

// 캘린더 전역 변수
let calendar;

document.addEventListener('DOMContentLoaded', function() {
    // 1. 인원 리스트 렌더링
    renderPersonnel();
    populateSelectBoxes();

    // 2. 캘린더 초기화
    let calendarEl = document.getElementById('calendar');
    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'ko',
        events: function(info, successCallback, failureCallback) {
            // DB(state)에 있는 이벤트 + 수/금 오후 부대휴식 자동 생성
            let allEvents = [...state.events];
            
            // 화면에 보이는 달의 수/금요일 오후 휴식 표시
            let start = new Date(info.start);
            let end = new Date(info.end);
            for(let d = start; d < end; d.setDate(d.getDate() + 1)) {
                let day = d.getDay();
                if(day === 3 || day === 5) { // 수(3), 금(5)
                    allEvents.push({
                        title: '수/금 오후 부대휴식',
                        start: d.toISOString().split('T')[0],
                        className: 'event-rest'
                    });
                }
            }
            successCallback(allEvents);
        }
    });
    calendar.render();

    // 3. 당직 폼 제출 이벤트
    document.getElementById('duty-form').addEventListener('submit', function(e) {
        e.preventDefault();
        const date = document.getElementById('duty-date').value;
        const person = document.getElementById('duty-person').value;
        const type = document.getElementById('duty-type').value;

        addDuty(date, person, type);
    });

    // 4. 휴무 신청 폼 제출 이벤트
    document.getElementById('leave-form').addEventListener('submit', function(e) {
        e.preventDefault();
        const date = document.getElementById('leave-date').value;
        const person = document.getElementById('leave-person').value;
        const type = document.getElementById('leave-type').value;

        requestLeave(date, person, type);
    });

    // 초기화 버튼
    document.getElementById('reset-btn').addEventListener('click', () => {
        if(confirm("모든 데이터를 초기화하시겠습니까?")) {
            localStorage.removeItem('combatLeaveState');
            location.reload();
        }
    });
});

// UI 업데이트 함수
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

// ----------------------------------------------------
// 핵심 로직 1: 당직 추가 및 전투휴무 획득 / 근무취침 부여
// ----------------------------------------------------
function addDuty(date, person, type) {
    const d = new Date(date);
    const day = d.getDay(); // 0:일, 1:월, 2:화, 3:수, 4:목, 5:금, 6:토

    // 평일 주간당직은 없음 차단
    if (type === 'day' && day >= 1 && day <= 5) {
        alert("평일 주간 당직은 없습니다.");
        return;
    }

    // 당직 이벤트 캘린더에 추가
    state.events.push({
        id: Date.now().toString(),
        title: `[당직] ${person} (${type === 'day' ? '주' : '야'})`,
        start: date,
        className: 'event-duty'
    });

    // [조건 2] 금야, 토주, 토야, 일주 -> 전투휴무 +1
    let earned = false;
    if ((day === 5 && type === 'night') || (day === 6) || (day === 0 && type === 'day')) {
        state.points[person] = (state.points[person] || 0) + 1;
        earned = true;
    }

    // [조건 3] 평일 야간, 일요일 야간 -> 다음날 근무취침
    if ((day >= 1 && day <= 5 && type === 'night') || (day === 0 && type === 'night')) {
        let nextDay = new Date(d);
        nextDay.setDate(nextDay.getDate() + 1);
        let nextDayStr = nextDay.toISOString().split('T')[0];
        
        state.events.push({
            id: Date.now().toString() + "-sleep",
            title: `[근무취침] ${person}`,
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
}

// ----------------------------------------------------
// 핵심 로직 2: 휴무 신청, 마일리지 차감, 출근 인원 검증
// ----------------------------------------------------
function requestLeave(date, person, type) {
    const d = new Date(date);
    const day = d.getDay();

    // 1. 보유 마일리지 체크
    const requiredPoints = type === 'full' ? 1 : 0.5;
    if ((state.points[person] || 0) < requiredPoints) {
        alert(`마일리지가 부족합니다. (보유: ${state.points[person]}, 필요: ${requiredPoints})`);
        return;
    }

    // 2. 수/금 오후 규칙 체크
    if ((day === 3 || day === 5) && type === 'pm') {
        alert("수요일, 금요일 오후는 모두가 쉬는 시간입니다. '오후 반투'를 신청할 필요가 없습니다. 종일을 쉬려면 '오전 반투'만 신청하세요.");
        return;
    }

    // 3. 최소 출근 인원 3명 체크 (가장 중요)
    if (!checkMinPersonnel(date, type)) {
        alert(`❌ 출근 인원 부족! 해당 날짜에 휴무를 사용할 수 없습니다. (최소 ${MIN_PERSONNEL}명 필요)`);
        return;
    }

    // 마일리지 차감 및 이벤트 추가
    state.points[person] -= requiredPoints;
    
    let titleStr = type === 'full' ? '종일' : (type === 'am' ? '오전' : '오후');
    state.events.push({
        id: Date.now().toString(),
        title: `[휴무-${titleStr}] ${person}`,
        start: date,
        className: 'event-leave',
        type: 'leave',
        leaveType: type,
        person: person
    });

    alert(`${person}의 ${date} 전투휴무(${titleStr})가 승인되었습니다.`);
    saveData();
}

// 최소 인원 계산 함수 (오전 / 오후 분리해서 계산)
function checkMinPersonnel(date, newLeaveType) {
    let amAbsentees = 0; // 오전 결근자 수
    let pmAbsentees = 0; // 오후 결근자 수
    const total = personnel.length;

    // 해당 날짜의 기존 이벤트들을 분석
    let dayEvents = state.events.filter(e => e.start === date);

    dayEvents.forEach(e => {
        if (e.type === 'sleep') {
            amAbsentees++; pmAbsentees++; // 근무취침은 종일 빠짐
        } else if (e.type === 'leave') {
            if (e.leaveType === 'full') { amAbsentees++; pmAbsentees++; }
            if (e.leaveType === 'am') { amAbsentees++; }
            if (e.leaveType === 'pm') { pmAbsentees++; }
        }
    });

    // 새로 신청하는 휴무를 더해서 시뮬레이션
    if (newLeaveType === 'full') { amAbsentees++; pmAbsentees++; }
    if (newLeaveType === 'am') { amAbsentees++; }
    if (newLeaveType === 'pm') { pmAbsentees++; }

    // 수/금요일 오후는 어차피 모두 쉬므로 오후 인원 체크 생략
    const d = new Date(date);
    const day = d.getDay();
    if (day === 3 || day === 5) {
        pmAbsentees = 0; // 통과
    }

    // 오전, 오후 둘 중 하나라도 남은 인원이 3명 미만이면 false 반환
    if ((total - amAbsentees) < MIN_PERSONNEL || (total - pmAbsentees) < MIN_PERSONNEL) {
        return false;
    }
    return true;
}
