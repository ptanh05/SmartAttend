package vn.edu.utc.smartattend.system;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@DisplayName("RBAC and API contracts")
class AuthorizationAndApiContractSystemTest extends SystemTestSupport {
    @Test
    @DisplayName("Anonymous requests cannot access protected APIs")
    void anonymousRequestsAreRejected() throws Exception {
        var client = new SmartAttendClient();
        for (var path : new String[] {
            "/api/courses",
            "/api/users",
            "/api/attendance/sessions",
            "/api/attendance/records",
            "/api/notifications",
            "/api/reports/attendance"
        }) {
            var response = client.get(path);
            assertEquals(401, response.status(), () -> path + " returned " + response.status() + ": " + response.body());
        }
    }

    @Test
    @DisplayName("Student is isolated from staff and admin operations")
    void studentCannotUseStaffApis() throws Exception {
        var student = loggedInStudent();
        assertEquals(403, student.get("/api/courses").status());
        assertEquals(403, student.get("/api/users").status());
        assertEquals(403, student.get("/api/analytics/overview").status());
        assertEquals(403, student.get("/api/audit-logs").status());
        assertEquals(403, student.get("/api/reports/attendance").status());
        assertEquals(403, student.patch("/api/attendance/records", Json.object(
            "recordId", "not-owned",
            "status", "present"
        )).status());
    }

    @Test
    @DisplayName("Teacher APIs return their documented top-level contracts")
    void teacherApiContracts() throws Exception {
        var teacher = loggedInTeacher();
        assertJsonContract(teacher.get("/api/courses"), "courses");
        assertJsonContract(teacher.get("/api/courses/sections"), "sections");
        assertJsonContract(teacher.get("/api/attendance/sessions"), "sessions");
        assertJsonContract(teacher.get("/api/attendance/policy"), "policy");
        assertJsonContract(teacher.get("/api/users"), "users");
        assertJsonContract(teacher.get("/api/analytics/overview"), "metrics");

        var csv = teacher.get("/api/reports/attendance?scope=detail");
        assertEquals(200, csv.status(), csv::body);
        assertTrue(csv.header("content-type").orElse("").startsWith("text/csv"));
        assertTrue(csv.header("content-disposition").orElse("").contains("attachment"));
    }

    @Test
    @DisplayName("Student APIs return data scoped to the current student")
    void studentApiContracts() throws Exception {
        var student = loggedInStudent();
        assertJsonContract(student.get("/api/attendance/sessions"), "sessions");
        assertJsonContract(student.get("/api/attendance/records"), "records");
        assertJsonContract(student.get("/api/attendance/leave"), "requests");
        assertJsonContract(student.get("/api/notifications"), "notifications");
        assertJsonContract(student.get("/api/users?kind=devices"), "devices");
    }

    @Test
    @DisplayName("Admin can access audit data and audit CSV export")
    void adminAuditContracts() throws Exception {
        var admin = loggedInAdmin();
        assertJsonContract(admin.get("/api/audit-logs"), "events");

        var csv = admin.get("/api/reports/audit");
        assertEquals(200, csv.status(), csv::body);
        assertTrue(csv.header("content-type").orElse("").startsWith("text/csv"));
        assertTrue(csv.header("content-disposition").orElse("").contains("attachment"));
    }

    private static void assertJsonContract(HttpResult response, String field) {
        assertEquals(200, response.status(), response::body);
        assertTrue(response.body().contains("\"ok\":true"), response::body);
        assertTrue(response.body().contains("\"" + field + "\":"),
            () -> "Missing field '" + field + "': " + response.body());
    }
}
