# TP Docker – Stack complète Node.js

## Sommaire

1. [Partie 1 — API & Dockerfile](#partie-1--api--dockerfile)
2. [Partie 2 — Registry privé](#partie-2--registry-privé)
3. [Partie 3 — Stack Compose & Nginx](#partie-3--stack-compose--nginx)

---

## Partie 1 — API & Dockerfile

### Structure

```
api/
├── index.js
├── package.json
├── Dockerfile
└── .dockerignore
```

### API Express

L'API expose trois routes :

| Route | Description |
|---|---|
| `GET /` | Retourne le hostname du conteneur, la variable `PET` et le compteur de requêtes |
| `GET /healthz` | Retourne `{"status":"ok"}` avec HTTP 200 — utilisé par le Healthcheck Docker |
| `GET /metrics` | Expose les métriques Prometheus via `prom-client` |

Le compteur est géré par `prom-client` (métrique `http_requests_total`) et également retourné dans le corps JSON de `GET /`.

### Dockerfile

- Image de base : `node:20-alpine`
- Dépendances installées avec `npm install --only=production`
- Utilisateur non-root `appuser` créé et utilisé via `USER appuser`
- `.dockerignore` excluant `node_modules`, `.env` et `.git`
- Healthcheck sur `/healthz` : `interval=30s`, `timeout=5s`, `start_period=10s`, `retries=3`

### Tests

Build de l'image :

```bash
docker build -t tp-docker-api:local ./api
```

Lancement :

```bash
docker run -d -e PET=dog -p 3000:3000 tp-docker-api:local
```

**GET /** :

```json
{
  "hostname": "bf8424318c20",
  "pet": "dog",
  "requests": 1
}
```

**GET /healthz** :

```json
{"status":"ok"}
```

HTTP 200 confirmé. Le conteneur passe en statut `healthy` après le `start_period` de 10 secondes.

**GET /metrics** :

```
http_requests_total 3
```

<!-- TODO: ajouter captures d'écran partie 1 -->

---

## Partie 2 — Registry privé

### Stack registry

Le registry et son interface web sont décrits dans un fichier séparé `docker-compose.registry.yml`, indépendant de la stack principale.

```
docker-compose.registry.yml
├── registry      (registry:2)       → port 5000
└── registry-ui   (joxit/docker-registry-ui)  → port 8081
```

Lancement :

```bash
docker-compose -f docker-compose.registry.yml up -d
```

### Push de l'image

```bash
docker build -t tp-docker-api:local ./api
docker tag tp-docker-api:local localhost:5000/mon-api:1.0.0
docker push localhost:5000/mon-api:1.0.0
```

Vérification :

```bash
curl http://localhost:5000/v2/_catalog
# {"repositories":["mon-api"]}

curl http://localhost:5000/v2/mon-api/tags/list
# {"name":"mon-api","tags":["1.0.0"]}
```

### Utilisation dans le docker-compose.yml principal

Le `docker-compose.yml` principal utilise l'image depuis le registry privé :

```yaml
services:
  api:
    image: localhost:5000/mon-api:1.0.0
```

<!-- TODO: ajouter capture d'écran interface web registry (http://<IP>:8081) avec l'image mon-api listée -->

---

## Partie 3 — Stack Compose & Nginx

### Structure

```
docker-compose.yml
nginx/
└── nginx.conf
```

### Services

Trois services sur un réseau Docker personnalisé `app-network` :

| Service | Image | Port exposé hôte | Variable |
|---|---|---|---|
| `cat` | `localhost:5000/mon-api:1.0.0` | aucun | `PET=cat` |
| `dog` | `localhost:5000/mon-api:1.0.0` | aucun | `PET=dog` |
| `nginx` | `nginx:alpine` | 80 | — |

`cat` et `dog` n'exposent aucun port à l'hôte — ils sont uniquement accessibles depuis le réseau interne `app-network`.

### Healthcheck & depends_on

`nginx` démarre uniquement quand `cat` et `dog` sont `healthy` :

```yaml
depends_on:
  cat:
    condition: service_healthy
  dog:
    condition: service_healthy
```

### Configuration Nginx

- `GET /` → upstream round-robin entre `cat:3000` et `dog:3000`
- `GET /cat` → exclusivement vers `cat:3000`
- `GET /dog` → exclusivement vers `dog:3000`

### Tests

```bash
docker-compose up -d

# Round-robin sur /
curl http://localhost/   # pet: cat
curl http://localhost/   # pet: dog

# Routes dédiées
curl http://localhost/cat  # toujours pet: cat
curl http://localhost/dog  # toujours pet: dog
```

Résultats obtenus :

```json
// GET / — alternance cat/dog confirmée sur 4 appels
{"hostname":"c53355b35dbe","pet":"cat","requests":1}
{"hostname":"c53355b35dbe","pet":"cat","requests":2}
{"hostname":"a3abb52de10c","pet":"dog","requests":1}
{"hostname":"c53355b35dbe","pet":"cat","requests":3}

// GET /cat
{"hostname":"c53355b35dbe","pet":"cat","requests":4}

// GET /dog
{"hostname":"a3abb52de10c","pet":"dog","requests":2}
```

<!-- TODO: ajouter captures d'écran GET /, /cat, /dog -->
