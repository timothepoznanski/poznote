# Poznote AI Assistant

Integrated AI chat that can search and read your notes. It works with a local [Ollama](https://ollama.com) or [LM Studio](https://lmstudio.ai) instance, a cloud provider like [Anthropic (Claude)](https://www.anthropic.com) or OpenAI, or any OpenAI-compatible server.

> [!TIP]
> Looking to connect an *external* AI assistant (VS Code Copilot, Claude CLI...) to your notes instead? See the [MCP Server documentation](MCP-SERVER.md).

## What it does

Once configured, an **AI** button appears in the dashboard toolbar and opens the chat panel right there.

The assistant has tools to **search and read all your notes**, and uses them on its own: ask "what do my notes say about X?", request a summary across several notes, or let it find that note you half remember. When you explicitly ask for it, it can also **create a note, rename one, or rewrite its content** (there is deliberately no delete tool). Answers are streamed and rendered as Markdown.

The conversation is kept while your browser tab stays open (it survives page reloads) and can be wiped at any time with the trash button in the panel header.

## Enabling the assistant

Go to **Settings → Admin Tools → AI Assistant** (administrator only) and pick a provider:

| Provider | URL | API key |
|---|---|---|
| **Ollama** (local) | Depends on where Ollama runs (container or host), see [Local servers and Docker networking](#local-servers-and-docker-networking) | Not needed |
| **LM Studio** (local) | Pre-filled with your Docker host address, port `1234`, see [Option 2](#option-2-ollama-installed-on-the-host) | Not needed |
| **Anthropic** (cloud) | Set automatically | Required |
| **OpenAI** (cloud) | Set automatically | Required |
| **Custom** | Any OpenAI-compatible base URL | Depends on the server |

Then use **Test connection**, which verifies the server is reachable and lists its available models so you can pick one with a click.

The configuration applies to the whole instance: once enabled by the administrator, every user profile gets the chat.

## Choosing a model

Pick a model that supports **tool calling** (also called "function calling"), e.g. `qwen3`, `llama3.1` or `mistral`. Tool calling is what lets the assistant browse your notes: with a model that lacks it, the chat still works (a notice tells you so) but cannot access your notes on its own.

## Local servers and Docker networking

The AI server is called **from the Poznote server**, never from your browser. Since Poznote runs in a Docker container, the URL you configure must be reachable *from inside that container*.

For a local Ollama, there are **two possible setups**, both fully supported:

| Setup | URL to configure | Network configuration |
|---|---|---|
| [**Option 1**: Ollama as a Docker container](#option-1-ollama-as-a-docker-container-simplest) | `http://ollama:11434` | None |
| [**Option 2**: Ollama installed on the host](#option-2-ollama-installed-on-the-host) | Your host address, as seen from the container | Required, this is the part that trips people up |

Choose option 1 if you are starting from scratch. Choose option 2 if Ollama is already installed on your machine or is also used by other applications.

### Option 1: Ollama as a Docker container (simplest)

The easiest setup by far is to not involve the host at all: add Ollama as another service in the same `docker-compose.yml` as Poznote:

```yaml
  ollama:
    image: ollama/ollama
    container_name: ollama
    restart: always
    volumes:
      - "./ollama:/root/.ollama"
```

then start it and pull a model:

```bash
docker compose up -d
docker exec ollama ollama pull qwen3
```

In the AI Assistant settings, replace the pre-filled URL with `http://ollama:11434`. Services in the same compose file share a Docker network and reach each other by service name, so there is nothing else to configure: no port to publish, no `OLLAMA_HOST` to set, and Ollama is never exposed outside the Docker network. If your compose file defines custom `networks`, put `ollama` on the same network as the Poznote service.

For GPU acceleration inside the container, see the [Ollama Docker image documentation](https://hub.docker.com/r/ollama/ollama).

### Option 2: Ollama installed on the host

If Ollama runs directly on the host machine (standard install from [ollama.com](https://ollama.com)), or if you use LM Studio, Poznote can reach it too, but the container must find its way back to the host through Docker networking. The subsections below explain how.

#### Why `localhost` does not work

`http://localhost:11434` or `http://127.0.0.1:11434` will **not** work: inside the container, `localhost` is the container itself, not the machine running Ollama. Docker gives every container its own isolated network stack: same physical machine, two different "localhost".

To reach the host, the container must go through the **gateway** of its Docker network, which is an IP address owned by the host.

#### Finding the right URL

Poznote pre-fills the URL field with its best guess of your Docker host address, in this order:

1. `host.docker.internal` if it resolves inside the container (always on Docker Desktop for Windows/macOS; on Linux only if you map it, see below);
2. otherwise the container's default gateway IP (e.g. `http://172.17.0.1:11434`), read from its routing table.

The pre-filled URL usually just works. If you need to check it yourself, from the host:

```bash
docker exec <poznote-webserver-container> ip route | grep default
# default via 172.17.0.1 dev eth0   ← the gateway IP is your host, as seen from the container
```

On Linux you can make `host.docker.internal` available (like on Docker Desktop) by adding this to the `webserver` service of your `docker-compose.yml`:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

then `docker compose up -d`. The URL becomes `http://host.docker.internal:11434`, stable and identical on every machine.

#### Making Ollama listen for the container

By default Ollama listens only on `127.0.0.1`, the host loopback, which is unreachable from any container even with the right gateway IP. You must set `OLLAMA_HOST` so it listens on an interface the container can reach.

With the standard Linux install (systemd):

```bash
sudo systemctl edit ollama
```

add:

```ini
[Service]
Environment="OLLAMA_HOST=172.17.0.1:11434"
```

then:

```bash
sudo systemctl restart ollama
```

Which address to bind:

- **`172.17.0.1` (the `docker0` bridge, recommended on Linux)**: reachable from all containers, exists on every Docker install, and not exposed to the outside world. Verify your `docker0` IP with `ip addr show docker0` (it is `172.17.0.1` unless you customized Docker's address pools).
- **`0.0.0.0`** (all interfaces): the simplest, but it exposes Ollama on **every** interface of the machine. Ollama has no authentication, so if your machine has a public IP, only use this behind a firewall that blocks the port (e.g. `ufw deny 11434`). Fine on a home machine behind NAT.
- A specific Compose network gateway (e.g. `192.168.48.1`): works, but these subnets are auto-assigned by Docker at network creation time and can change if the network is recreated, so avoid it.

On Docker Desktop (Windows/macOS) with Ollama running on the host, `OLLAMA_HOST=0.0.0.0` is the usual choice; the machine is typically not directly exposed, and `host.docker.internal` then reaches it out of the box.

**LM Studio** works the same way: in its server settings, enable "Serve on Local Network" (equivalent to binding `0.0.0.0`), or it will only listen on `127.0.0.1`.

#### Checking connectivity

From the host, verify what Ollama actually listens on:

```bash
ss -tlnp | grep 11434
```

and test the exact URL Poznote will use, from inside the container:

```bash
docker exec <poznote-webserver-container> curl -s -m 3 http://172.17.0.1:11434/
# "Ollama is running"
```

If this returns nothing, the problem is the Ollama binding or a firewall, not Poznote. The **Test connection** button in the settings page performs the same check and lists the available models on success.

## Privacy

The AI server is called from the Poznote server, never from your browser. With a local Ollama or LM Studio instance, your notes and conversations never leave your machine. With a cloud provider, the parts of your notes the assistant reads to answer are sent to that provider.
