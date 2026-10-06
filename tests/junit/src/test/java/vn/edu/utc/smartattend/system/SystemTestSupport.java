package vn.edu.utc.smartattend.system;

import org.junit.jupiter.api.BeforeAll;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

abstract class SystemTestSupport {
    @BeforeAll
    static void applicationIsReachable() throws Exception {
        var response = new SmartAttendClient().get("/");
        assertEquals(200, response.status(),
            () -> "SmartAttend is not reachable at " + SystemTestConfig.baseUri() + ": " + response.body());
    }

    static SmartAttendClient loggedInStudent() throws Exception {
        return loggedIn(SystemTestConfig.studentId(), SystemTestConfig.studentPassword(), "student", "student");
    }

    static SmartAttendClient loggedInTeacher() throws Exception {
        return loggedIn(SystemTestConfig.teacherEmail(), SystemTestConfig.teacherPassword(), "staff", "teacher");
    }

    static SmartAttendClient loggedInAdmin() throws Exception {
        return loggedIn(SystemTestConfig.adminEmail(), SystemTestConfig.adminPassword(), "staff", "admin");
    }

    private static SmartAttendClient loggedIn(String identifier, String password, String portal, String role) throws Exception {
        var client = new SmartAttendClient();
        var response = client.login(identifier, password, portal);
        assertEquals(200, response.status(), () -> "Login failed for " + role + ": " + response.body());
        assertTrue(response.body().contains("\"ok\":true"), response::body);
        assertTrue(response.body().contains("\"role\":\"" + role + "\""), response::body);
        return client;
    }
}
