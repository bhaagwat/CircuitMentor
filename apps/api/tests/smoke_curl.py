import json
import urllib.request

# 1. Health
req = urllib.request.Request("http://localhost:8000/health")
with urllib.request.urlopen(req) as resp:
    print(f"GET /health -> HTTP {resp.status}: {resp.read().decode().strip()}")

# 2. Register
reg_data = json.dumps({"email": "demo_save@example.com", "password": "password123", "display_name": "Demo"}).encode()
req = urllib.request.Request(
    "http://localhost:8000/v1/auth/register",
    data=reg_data,
    headers={"Content-Type": "application/json"},
    method="POST",
)
with urllib.request.urlopen(req) as resp:
    set_cookie_header = resp.headers.get("Set-Cookie")
    print(f"POST /v1/auth/register -> HTTP {resp.status}, Set-Cookie: {set_cookie_header[:60]}...")

# 3. Login
login_data = json.dumps({"email": "demo_save@example.com", "password": "password123"}).encode()
req = urllib.request.Request(
    "http://localhost:8000/v1/auth/login",
    data=login_data,
    headers={"Content-Type": "application/json"},
    method="POST",
)
with urllib.request.urlopen(req) as resp:
    set_cookie = resp.headers.get("Set-Cookie")
    cookie_str = set_cookie.split(";")[0] if set_cookie else ""
    print(f"POST /v1/auth/login -> HTTP {resp.status}, Cookie: {cookie_str[:35]}...")

# 4. Create Project with Cookie auth
create_data = json.dumps({"title": "Cookie Saved Circuit", "board_type": "breadboard"}).encode()
req = urllib.request.Request(
    "http://localhost:8000/v1/projects",
    data=create_data,
    headers={"Content-Type": "application/json", "Cookie": cookie_str},
    method="POST",
)
with urllib.request.urlopen(req) as resp:
    body = json.loads(resp.read().decode())
    proj_id = body["id"]
    print(f"POST /v1/projects -> HTTP {resp.status}, Project ID: {proj_id}")

# 5. PATCH Circuit Data with Cookie auth
patch_data = json.dumps({
    "circuit_data": {
        "v": 1,
        "components": [
            {"id": "r1", "partId": "resistor", "x": 120, "y": 200},
            {"id": "d1", "partId": "led.red", "x": 240, "y": 200}
        ],
        "wires": [{"from": "r1:1", "to": "d1:0"}]
    }
}).encode()
req = urllib.request.Request(
    f"http://localhost:8000/v1/projects/{proj_id}",
    data=patch_data,
    headers={"Content-Type": "application/json", "Cookie": cookie_str},
    method="PATCH",
)
with urllib.request.urlopen(req) as resp:
    body = json.loads(resp.read().decode())
    comp_count = len(body["circuit_data"]["components"])
    print(f"PATCH /v1/projects/{proj_id} -> HTTP {resp.status}, Saved Components Count: {comp_count}")
