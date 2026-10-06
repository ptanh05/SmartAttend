package vn.edu.utc.smartattend.system;

import java.net.http.HttpHeaders;
import java.util.Optional;

record HttpResult(int status, HttpHeaders headers, String body) {
    boolean isSuccessful() {
        return status >= 200 && status < 300;
    }

    Optional<String> header(String name) {
        return headers.firstValue(name);
    }
}
