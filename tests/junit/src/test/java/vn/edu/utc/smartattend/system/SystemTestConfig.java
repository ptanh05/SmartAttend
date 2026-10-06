package vn.edu.utc.smartattend.system;

import java.net.URI;

final class SystemTestConfig {
    private SystemTestConfig() {}

    static URI baseUri() {
        var configured = env("SMARTATTEND_BASE_URL", "http://localhost:3000").strip();
        if (!configured.endsWith("/")) configured += "/";
        return URI.create(configured);
    }

    static String studentId() {
        return env("SMARTATTEND_STUDENT_ID", "20260001");
    }

    static String studentPassword() {
        return env("SMARTATTEND_STUDENT_PASSWORD", "student123");
    }

    static String teacherEmail() {
        return env("SMARTATTEND_TEACHER_EMAIL", "teacher@smartattend.edu.vn");
    }

    static String teacherPassword() {
        return env("SMARTATTEND_TEACHER_PASSWORD", "12345678");
    }

    static String adminEmail() {
        return env("SMARTATTEND_ADMIN_EMAIL", "admin@smartattend.edu.vn");
    }

    static String adminPassword() {
        return env("SMARTATTEND_ADMIN_PASSWORD", "12345678");
    }

    static boolean mutatingTestsEnabled() {
        return Boolean.parseBoolean(env("SMARTATTEND_RUN_MUTATING", "false"));
    }

    private static String env(String name, String fallback) {
        var value = System.getenv(name);
        return value == null || value.isBlank() ? fallback : value;
    }
}
