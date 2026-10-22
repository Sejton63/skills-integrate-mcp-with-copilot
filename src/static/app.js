document.addEventListener("DOMContentLoaded", () => {
  const activitiesList = document.getElementById("activities-list");
  const activitySelect = document.getElementById("activity");
  const signupForm = document.getElementById("signup-form");
  const messageDiv = document.getElementById("message");
  const userIcon = document.getElementById("user-icon");
  const userDropdown = document.getElementById("user-dropdown");
  const loginButton = document.getElementById("login-button");
  const registerButton = document.getElementById("register-button");
  const logoutButton = document.getElementById("logout-button");
  const resetPasswordButton = document.getElementById("reset-password-button");
  const userDisplay = document.getElementById("user-display");
  const loginModal = document.getElementById("login-modal");
  const loginForm = document.getElementById("login-form");
  const cancelLoginButton = document.getElementById("cancel-login");
  const registerModal = document.getElementById("register-modal");
  const registerForm = document.getElementById("register-form");
  const cancelRegisterButton = document.getElementById("cancel-register");
  const resetPasswordModal = document.getElementById("reset-password-modal");
  const resetPasswordForm = document.getElementById("reset-password-form");
  const cancelResetPasswordButton = document.getElementById("cancel-reset-password");

  let authToken = localStorage.getItem("authToken") || "";
  let accountUsername = "";
  let accountRole = "";

  function showMessage(text, type) {
    messageDiv.textContent = text;
    messageDiv.className = type;
    messageDiv.classList.remove("hidden");

    setTimeout(() => {
      messageDiv.classList.add("hidden");
    }, 5000);
  }

  function updateAdminUi() {
    const isAdmin = Boolean(authToken && accountRole === "admin");

    signupForm.querySelectorAll("input, select, button").forEach((element) => {
      element.disabled = !isAdmin;
    });
    document.getElementById("admin-note").textContent = isAdmin
      ? "You are signed in as an administrator."
      : "Administrator login is required to register or unregister students.";

    if (authToken && accountUsername) {
      loginButton.classList.add("hidden");
      registerButton.classList.add("hidden");
      logoutButton.classList.remove("hidden");
      userDisplay.classList.remove("hidden");
      userDisplay.textContent = `Logged in: ${accountUsername} (${accountRole})`;
      resetPasswordButton.classList.toggle("hidden", !isAdmin);
    } else {
      loginButton.classList.remove("hidden");
      registerButton.classList.remove("hidden");
      logoutButton.classList.add("hidden");
      resetPasswordButton.classList.add("hidden");
      userDisplay.classList.add("hidden");
      userDisplay.textContent = "";
    }
  }

  async function verifyAuthStatus() {
    if (!authToken) {
      updateAdminUi();
      return;
    }

    try {
      const response = await fetch("/auth/status", {
        headers: {
          "X-Auth-Token": authToken,
        },
      });

      const result = await response.json();
      if (result.authenticated) {
        accountUsername = result.username;
        accountRole = result.role;
      } else {
        authToken = "";
        accountUsername = "";
        accountRole = "";
        localStorage.removeItem("authToken");
      }
    } catch (error) {
      authToken = "";
      accountUsername = "";
      accountRole = "";
      localStorage.removeItem("authToken");
    }

    updateAdminUi();
  }

  // Function to fetch activities from API
  async function fetchActivities() {
    try {
      const response = await fetch("/activities");
      const activities = await response.json();

      // Clear loading message
      activitiesList.innerHTML = "";
      activitySelect.innerHTML = '<option value="">-- Select an activity --</option>';

      const isAdmin = Boolean(authToken && accountRole === "admin");

      // Populate activities list
      Object.entries(activities).forEach(([name, details]) => {
        const activityCard = document.createElement("div");
        activityCard.className = "activity-card";

        const spotsLeft =
          details.max_participants - details.participants.length;

        // Create participants HTML with delete icons instead of bullet points
        const participantsHTML =
          details.participants.length > 0
            ? `<div class="participants-section">
              <h5>Participants:</h5>
              <ul class="participants-list">
                ${details.participants
                  .map(
                    (email) =>
                      `<li><span class="participant-email">${email}</span>${
                        isAdmin
                          ? `<button class="delete-btn" data-activity="${name}" data-email="${email}">❌</button>`
                          : ""
                      }</li>`
                  )
                  .join("")}
              </ul>
            </div>`
            : `<p><em>No participants yet</em></p>`;

        activityCard.innerHTML = `
          <h4>${name}</h4>
          <p>${details.description}</p>
          <p><strong>Schedule:</strong> ${details.schedule}</p>
          <p><strong>Availability:</strong> ${spotsLeft} spots left</p>
          <div class="participants-container">
            ${participantsHTML}
          </div>
        `;

        activitiesList.appendChild(activityCard);

        // Add option to select dropdown
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        activitySelect.appendChild(option);
      });

      // Add event listeners to delete buttons
      if (isAdmin) {
        document.querySelectorAll(".delete-btn").forEach((button) => {
          button.addEventListener("click", handleUnregister);
        });
      }
    } catch (error) {
      activitiesList.innerHTML =
        "<p>Failed to load activities. Please try again later.</p>";
      console.error("Error fetching activities:", error);
    }
  }

  // Handle unregister functionality
  async function handleUnregister(event) {
    const button = event.target;
    const activity = button.getAttribute("data-activity");
    const email = button.getAttribute("data-email");

    try {
      const response = await fetch(
        `/activities/${encodeURIComponent(
          activity
        )}/unregister?email=${encodeURIComponent(email)}`,
        {
          method: "DELETE",
          headers: {
            "X-Auth-Token": authToken,
          },
        }
      );

      const result = await response.json();

      if (response.ok) {
        showMessage(result.message, "success");

        // Refresh activities list to show updated participants
        fetchActivities();
      } else {
        showMessage(result.detail || "An error occurred", "error");
      }
    } catch (error) {
      showMessage("Failed to unregister. Please try again.", "error");
      console.error("Error unregistering:", error);
    }
  }

  // Handle form submission
  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value;
    const activity = document.getElementById("activity").value;

    try {
      const response = await fetch(
        `/activities/${encodeURIComponent(
          activity
        )}/signup?email=${encodeURIComponent(email)}`,
        {
          method: "POST",
          headers: {
            "X-Auth-Token": authToken,
          },
        }
      );

      const result = await response.json();

      if (response.ok) {
        showMessage(result.message, "success");
        signupForm.reset();

        // Refresh activities list to show updated participants
        fetchActivities();
      } else {
        showMessage(result.detail || "An error occurred", "error");
      }
    } catch (error) {
      showMessage("Failed to sign up. Please try again.", "error");
      console.error("Error signing up:", error);
    }
  });

  userIcon.addEventListener("click", () => {
    userDropdown.classList.toggle("hidden");
  });

  loginButton.addEventListener("click", () => {
    loginModal.classList.remove("hidden");
    userDropdown.classList.add("hidden");
  });

  registerButton.addEventListener("click", () => {
    registerModal.classList.remove("hidden");
    userDropdown.classList.add("hidden");
  });

  resetPasswordButton.addEventListener("click", () => {
    resetPasswordModal.classList.remove("hidden");
    userDropdown.classList.add("hidden");
  });

  cancelLoginButton.addEventListener("click", () => {
    loginModal.classList.add("hidden");
    loginForm.reset();
  });

  cancelRegisterButton.addEventListener("click", () => {
    registerModal.classList.add("hidden");
    registerForm.reset();
  });

  cancelResetPasswordButton.addEventListener("click", () => {
    resetPasswordModal.classList.add("hidden");
    resetPasswordForm.reset();
  });

  logoutButton.addEventListener("click", async () => {
    try {
      await fetch("/auth/logout", {
        method: "POST",
        headers: {
          "X-Auth-Token": authToken,
        },
      });
    } catch (error) {
      console.error("Error logging out:", error);
    }

    authToken = "";
    accountUsername = "";
    accountRole = "";
    localStorage.removeItem("authToken");
    updateAdminUi();
    userDropdown.classList.add("hidden");
    fetchActivities();
    showMessage("Logged out", "info");
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;

    try {
      const response = await fetch("/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      const result = await response.json();

      if (!response.ok) {
        showMessage(result.detail || "Login failed", "error");
        return;
      }

      authToken = result.token;
      accountUsername = result.username;
      accountRole = result.role;
      localStorage.setItem("authToken", authToken);
      updateAdminUi();
      loginModal.classList.add("hidden");
      loginForm.reset();
      fetchActivities();
      showMessage("Login successful", "success");
    } catch (error) {
      showMessage("Failed to login. Please try again.", "error");
      console.error("Error logging in:", error);
    }
  });

  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = document.getElementById("register-username").value.trim();
    const password = document.getElementById("register-password").value;

    try {
      const response = await fetch("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const result = await response.json();
      if (!response.ok) {
        showMessage(result.detail || "Account creation failed", "error");
        return;
      }

      const loginResponse = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const loginResult = await loginResponse.json();
      if (!loginResponse.ok) {
        showMessage(loginResult.detail || "Account created; please log in", "error");
        registerModal.classList.add("hidden");
        registerForm.reset();
        return;
      }

      authToken = loginResult.token;
      accountUsername = loginResult.username;
      accountRole = loginResult.role;
      localStorage.setItem("authToken", authToken);
      updateAdminUi();
      registerModal.classList.add("hidden");
      registerForm.reset();
      fetchActivities();
      showMessage("Student account created", "success");
    } catch (error) {
      showMessage("Failed to create account. Please try again.", "error");
      console.error("Error creating account:", error);
    }
  });

  resetPasswordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = document.getElementById("reset-username").value.trim();
    const newPassword = document.getElementById("new-password").value;

    try {
      const response = await fetch("/auth/password-reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Auth-Token": authToken,
        },
        body: JSON.stringify({ username, new_password: newPassword }),
      });
      const result = await response.json();
      if (!response.ok) {
        showMessage(result.detail || "Password reset failed", "error");
        return;
      }

      resetPasswordModal.classList.add("hidden");
      resetPasswordForm.reset();
      const resettingSelf = username.toLowerCase() === accountUsername;
      if (resettingSelf) {
        authToken = "";
        accountUsername = "";
        accountRole = "";
        localStorage.removeItem("authToken");
        updateAdminUi();
        fetchActivities();
      }
      showMessage(
        resettingSelf ? `${result.message}. Please log in again.` : result.message,
        "success"
      );
    } catch (error) {
      showMessage("Failed to reset password. Please try again.", "error");
      console.error("Error resetting password:", error);
    }
  });

  window.addEventListener("click", (event) => {
    [
      [loginModal, loginForm],
      [registerModal, registerForm],
      [resetPasswordModal, resetPasswordForm],
    ].forEach(([modal, form]) => {
      if (event.target === modal) {
        modal.classList.add("hidden");
        form.reset();
      }
    });
  });

  // Initialize app
  verifyAuthStatus().then(fetchActivities);
});
