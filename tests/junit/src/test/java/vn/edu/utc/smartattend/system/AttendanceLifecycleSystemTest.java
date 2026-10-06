package vn.edu.utc.smartattend.system;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

@DisplayName("End-to-end attendance lifecycle")
class AttendanceLifecycleSystemTest extends SystemTestSupport {
    @Test
    @DisplayName("Teacher creates and starts a class, student checks in, teacher closes it")
    void completeAttendanceLifecycle() throws Exception {
        assumeTrue(SystemTestConfig.mutatingTestsEnabled(),
            "Set SMARTATTEND_RUN_MUTATING=true to run the database-mutating lifecycle test");

        var teacher = loggedInTeacher();
        var suffix = DateTimeFormatter.ofPattern("MMddHHmmss").format(LocalDateTime.now());

        var courseResponse = teacher.post("/api/courses", Json.object(
            "code", "JT" + suffix,
            "name", "JUnit system test " + suffix,
            "department", "System Test",
            "color", "indigo"
        ));
        assertSuccess(courseResponse);
        var courseId = Json.stringField(courseResponse.body(), "courseId");

        var sectionResponse = teacher.post("/api/courses/sections", Json.object(
            "courseId", courseId,
            "room", "JUnit Lab",
            "startsAt", "00:00",
            "endsAt", "23:59",
            "dayOfWeek", 1,
            "autoStart", false
        ));
        assertSuccess(sectionResponse);
        var sectionId = Json.stringField(sectionResponse.body(), "sectionId");

        var sessionResponse = teacher.put("/api/attendance/sessions", Json.object("sectionId", sectionId));
        assertSuccess(sessionResponse);
        var sessionId = Json.stringField(sessionResponse.body(), "sessionId");

        var startResponse = teacher.post("/api/attendance/sessions/" + sessionId, Json.object("action", "start"));
        assertSuccess(startResponse);

        var rotateResponse = teacher.post("/api/attendance/sessions/" + sessionId, Json.object("action", "rotate"));
        assertSuccess(rotateResponse);
        var challenge = Json.stringField(rotateResponse.body(), "challenge");

        var student = loggedInStudent();
        var verifyResponse = student.post("/api/attendance/verify", Json.object(
            "code", challenge,
            "method", "manual_code",
            "device", "JUnit HttpClient"
        ));
        assertSuccess(verifyResponse);
        assertTrue(verifyResponse.body().contains("\"confidence\":"), verifyResponse::body);

        var records = student.get("/api/attendance/records");
        assertSuccess(records);
        assertTrue(records.body().contains(sessionId),
            () -> "The student's records do not contain session " + sessionId + ": " + records.body());

        var closeResponse = teacher.post("/api/attendance/sessions/" + sessionId, Json.object("action", "close"));
        assertSuccess(closeResponse);
        assertTrue(closeResponse.body().contains("\"status\":\"closed\""), closeResponse::body);
    }

    private static void assertSuccess(HttpResult response) {
        assertEquals(200, response.status(), response::body);
        assertTrue(response.body().contains("\"ok\":true"), response::body);
    }
}
