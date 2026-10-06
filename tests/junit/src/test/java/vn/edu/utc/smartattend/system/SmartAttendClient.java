package vn.edu.utc.smartattend.system;

import java.io.IOException;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

final class SmartAttendClient {
    private final URI baseUri;
    private final HttpClient client;

    SmartAttendClient() {
        this(SystemTestConfig.baseUri());
    }

    SmartAttendClient(URI baseUri) {
        this.baseUri = baseUri;
        var cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
        this.client = HttpClient.newBuilder()
            .cookieHandler(cookies)
            .connectTimeout(Duration.ofSeconds(10))
            .version(HttpClient.Version.HTTP_1_1)
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();
    }

    HttpResult get(String path) throws IOException, InterruptedException {
        return send("GET", path, null);
    }

    HttpResult post(String path, String json) throws IOException, InterruptedException {
        return send("POST", path, json);
    }

    HttpResult put(String path, String json) throws IOException, InterruptedException {
        return send("PUT", path, json);
    }

    HttpResult patch(String path, String json) throws IOException, InterruptedException {
        return send("PATCH", path, json);
    }

    HttpResult delete(String path) throws IOException, InterruptedException {
        return send("DELETE", path, null);
    }

    HttpResult login(String identifier, String password, String portal) throws IOException, InterruptedException {
        return post("/api/auth/login", Json.object(
            "identifier", identifier,
            "password", password,
            "portal", portal
        ));
    }

    private HttpResult send(String method, String path, String json) throws IOException, InterruptedException {
        var request = HttpRequest.newBuilder(resolve(path))
            .timeout(Duration.ofSeconds(30))
            .version(HttpClient.Version.HTTP_1_1)
            .header("User-Agent", "SmartAttend-JUnit-System-Test/1.0")
            .header("Accept", "application/json, text/csv, text/html")
            .method(method, json == null
                ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofString(json));

        if (json != null) request.header("Content-Type", "application/json");

        try {
            var response = client.send(request.build(), HttpResponse.BodyHandlers.ofString());
            return new HttpResult(response.statusCode(), response.headers(), response.body());
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw error;
        }
    }

    private URI resolve(String path) {
        return baseUri.resolve(path.startsWith("/") ? path.substring(1) : path);
    }
}
