package vn.edu.utc.smartattend.system;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

@DisplayName("Public surface and authentication")
class PublicAndAuthenticationSystemTest extends SystemTestSupport {
    @Test
    @DisplayName("Public and role routes render while an unknown route returns 404")
    void publicRoutesRender() throws Exception {
        var client = new SmartAttendClient();
        for (var path : new String[] { "/", "/student/dashboard", "/teacher/dashboard", "/admin/dashboard" }) {
            var response = client.get(path);
            assertEquals(200, response.status(), () -> path + " returned " + response.status());
            assertTrue(response.body().contains("SmartAttend"), () -> path + " did not render the application shell");
        }
        assertEquals(404, client.get("/route-that-must-not-exist").status());
    }

    @Test
    @DisplayName("Invalid credentials are rejected without issuing a session")
    void invalidCredentialsAreRejected() throws Exception {
        var response = new SmartAttendClient().login(
            "missing-user-" + System.nanoTime() + "@example.invalid",
            "wrong-password",
            "staff"
        );

        assertEquals(401, response.status());
        assertTrue(response.body().contains("invalid_credentials"), response::body);
        assertFalse(response.header("set-cookie").isPresent(), "An invalid login must not issue a session cookie");
    }

    @Test
    @DisplayName("Student session is created, resolved by /api/me, and revoked on logout")
    void studentLoginAndLogoutLifecycle() throws Exception {
        var client = loggedInStudent();
        var me = client.get("/api/me");
        assertEquals(200, me.status());
        assertTrue(me.body().contains("\"ok\":true"), me::body);
        assertTrue(me.body().contains("\"role\":\"student\""), me::body);

        var logout = client.post("/api/auth/logout", "{}");
        assertEquals(200, logout.status(), logout::body);
        assertTrue(logout.body().contains("\"ok\":true"), logout::body);

        var afterLogout = client.get("/api/me");
        assertEquals(200, afterLogout.status());
        assertTrue(afterLogout.body().contains("\"ok\":false"), afterLogout::body);
    }

    @Test
    @DisplayName("Teacher and admin accounts resolve to the correct roles")
    void staffRolesResolveCorrectly() throws Exception {
        var teacherMe = loggedInTeacher().get("/api/me");
        assertTrue(teacherMe.body().contains("\"role\":\"teacher\""), teacherMe::body);

        var adminMe = loggedInAdmin().get("/api/me");
        assertTrue(adminMe.body().contains("\"role\":\"admin\""), adminMe::body);
    }
}
