const state = {
  groups: [],
  selectedGroup: null,
};

const elements = {
  healthText: document.querySelector("#healthText"),
  refreshGroups: document.querySelector("#refreshGroups"),
  groupSearch: document.querySelector("#groupSearch"),
  groupsStatus: document.querySelector("#groupsStatus"),
  groupsList: document.querySelector("#groupsList"),
  selectedGroupName: document.querySelector("#selectedGroupName"),
  selectedGroupId: document.querySelector("#selectedGroupId"),
  messageForm: document.querySelector("#messageForm"),
  messageText: document.querySelector("#messageText"),
  markMessage: document.querySelector("#markMessage"),
  ttl: document.querySelector("#ttl"),
  charCount: document.querySelector("#charCount"),
  sendButton: document.querySelector("#sendButton"),
  resultBox: document.querySelector("#resultBox"),
};

async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({
    ok: false,
    error: { message: "Response khong phai JSON" },
  }));

  if (!response.ok || data.ok === false) {
    const message = data.error?.message || `HTTP ${response.status}`;
    throw new Error(message);
  }

  return data;
}

async function loadHealth() {
  try {
    const data = await apiFetch("/api/health");
    elements.healthText.textContent = data.zalo_logged_in
      ? "Zalo client da san sang"
      : "Zalo client chua xac thuc";
    elements.healthText.className = data.zalo_logged_in ? "ok" : "warn";
  } catch (error) {
    elements.healthText.textContent = error.message;
    elements.healthText.className = "error";
  }
}

async function loadGroups(refresh = false) {
  elements.groupsStatus.textContent = refresh ? "Dang refresh..." : "Dang tai danh sach nhom...";
  elements.groupsList.innerHTML = "";

  try {
    const data = await apiFetch(`/api/groups${refresh ? "?refresh=1" : ""}`);
    state.groups = data.groups || [];
    renderGroups();
    elements.groupsStatus.textContent = state.groups.length
      ? `${state.groups.length} nhom${data.cached ? " (cache)" : ""}`
      : "Khong co nhom";
  } catch (error) {
    elements.groupsStatus.textContent = error.message;
    elements.groupsStatus.className = "status error";
  }
}

function renderGroups() {
  const query = elements.groupSearch.value.trim().toLowerCase();
  const groups = state.groups.filter((group) => {
    const name = String(group.name || "").toLowerCase();
    const id = String(group.id || "").toLowerCase();
    return !query || name.includes(query) || id.includes(query);
  });

  elements.groupsList.innerHTML = "";

  for (const group of groups) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "group-row";
    button.dataset.groupId = group.id;
    if (state.selectedGroup?.id === group.id) {
      button.classList.add("selected");
    }

    const name = document.createElement("span");
    name.className = "group-name";
    name.textContent = group.name || `Nhom ${group.id}`;

    const meta = document.createElement("span");
    meta.className = "group-meta";
    const memberText = group.total_member ? ` · ${group.total_member} thanh vien` : "";
    meta.textContent = `${group.id}${memberText}`;

    button.append(name, meta);
    button.addEventListener("click", () => selectGroup(group));
    elements.groupsList.appendChild(button);
  }
}

function selectGroup(group) {
  state.selectedGroup = group;
  elements.selectedGroupName.textContent = group.name || `Nhom ${group.id}`;
  elements.selectedGroupId.textContent = group.id;
  renderGroups();
  updateSendState();
}

function updateSendState() {
  const length = elements.messageText.value.length;
  elements.charCount.textContent = `${length}/2000`;
  elements.sendButton.disabled = !state.selectedGroup || !elements.messageText.value.trim();
}

async function sendMessage(event) {
  event.preventDefault();
  if (!state.selectedGroup) {
    showResult("Hay chon nhom truoc khi gui", "error");
    return;
  }

  elements.sendButton.disabled = true;
  elements.sendButton.textContent = "Dang gui...";

  try {
    const data = await apiFetch("/api/messages", {
      method: "POST",
      body: JSON.stringify({
        group_id: state.selectedGroup.id,
        message: elements.messageText.value,
        ttl: Number(elements.ttl.value || 0),
        mark_message: elements.markMessage.value || null,
      }),
    });
    showResult(`Da gui vao ${state.selectedGroup.name || state.selectedGroup.id}`, "ok", data.result);
    elements.messageText.value = "";
    updateSendState();
  } catch (error) {
    showResult(error.message, "error");
  } finally {
    elements.sendButton.textContent = "Gui tin";
    updateSendState();
  }
}

function showResult(message, type, detail = null) {
  elements.resultBox.className = `result ${type}`;
  elements.resultBox.textContent = message;

  if (detail && Object.keys(detail).length) {
    const pre = document.createElement("pre");
    pre.textContent = JSON.stringify(detail, null, 2);
    elements.resultBox.appendChild(pre);
  }
}

elements.refreshGroups.addEventListener("click", () => loadGroups(true));
elements.groupSearch.addEventListener("input", renderGroups);
elements.messageText.addEventListener("input", updateSendState);
elements.messageForm.addEventListener("submit", sendMessage);

loadHealth();
loadGroups();
updateSendState();
