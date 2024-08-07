# MiniPay Airdrop

MiniPay Airdrop is a project designed to manage and distribute airdrop allocations. It consists of a set of APIs and services that interact with Dune Analytics and Redis to store and retrieve allocation data.

## Project Structure

The project is structured as follows:

- `src/`: Contains the main source code
  - `entry/`: Entry points for external and internal APIs
  - `operations/`: Business logic for handling allocations, imports, and refreshes
  - `services/`: Interfaces with external services (Redis, Dune, Google Cloud Tasks)
  - `dev/`: Development and testing utilities
  - `schema.ts`: Defines data schemas
  - `constants.ts`: Project-wide constants
  - `utils.ts`: Utility functions
- `infra/`: Contains Terraform scripts for infrastructure provisioning

## Local Development

There are two main paths for local development, depending on your role and needs:

### For Frontend Engineers

If you're a frontend engineer or just need to interact with the API:

1. Install dependencies:

```bash
   pnpm install
```

2. Run the mock server:

```bash
   pnpm run dev:mock-server
```

3. Once the server is running, you can access the Swagger OpenAPI specification at:

```bash
   http://localhost:3000/docs
```

This provides an interactive documentation of the API endpoints, making it easy to understand and test the API without setting up the full backend infrastructure.

4. The mock API supports various test scenarios and failure modes. You can trigger these by using specific addresses when calling the API. For example:

   - `0xb873Bb7e3B723C49B9516566a0B150bbfe1E1Dac` will return a 403 Forbidden error
   - `0x11815DeF716bFC4a394a32Ea41a981f3aC56D0d9` will be rate limited 50% of the time
   - `0xc9D04AFEa3d50632Cd0ad879E858F043d17407Ae` will fail with a 500 Internal Server Error
   - `0x556DDc9381dF097C4946De438a4272ECba26A496` will return an empty allocation

   These test scenarios are fully documented in the Swagger specification, allowing you to easily test different API behaviors and error handling in your frontend application.

### For Backend Development

If you're developing the actual package:

1. Install dependencies:

```bash
   pnpm install
```

2. Set up environment variables:
   Create a `.env.local` file with the necessary environment variables (DUNE_API_KEY, REDIS_URL, etc.)

3. Ensure Docker is installed on your system, as it's required for running the development services.

4. Choose one of the following streamlined development commands:

```bash
   pnpm run dev:stream
```

or for a TUI (Text User Interface) experience:

```bash
   pnpm run dev:tui
```

These commands are persistent watch commands that run several processes concurrently:

- `dev:services`: Starts the required Docker containers (Redis, Cloud Tasks Emulator)
- `dev:internal`: Runs the internal API with live reloading
- `dev:external`: Runs the external API with live reloading
- `dev:create-queue`: Sets up the development task queue
- `build:watch`: Watches for TypeScript changes and recompiles as needed

The TUI version provides a text-based dashboard for monitoring all these processes.

Both development paths will automatically update and reload as you make changes to the code, providing a smooth development experience.

#### Running a local import

After starting the dev servers, you can simulate the data indexing process and query the local Redis database:

1. Start the dev servers:

```bash
   pnpm run dev:stream
```

2. Trigger the refresh endpoint to index the first batch (development mode only):

```bash
   curl http://localhost:3001/refresh
```

3. Check the indexed allocations in your local Redis database:

```bash
   redis-cli
   > KEYS allocation:*
```

This will show you the keys for all indexed allocations.

4. Construct a curl query to get a specific address's allocation:

```bash
   curl http://localhost:3000/allocation/0x1234...  # Replace with an actual indexed address
```

This process allows you to test the indexing and retrieval of allocations using your local development environment.

This section provides backend developers with a step-by-step guide to:

1. Start the development servers
2. Trigger the refresh endpoint to index the first batch of data
3. Use redis-cli to inspect the indexed allocations in the local Redis database
4. Construct a curl query to retrieve a specific allocation

This workflow will help developers test and verify the indexing and retrieval processes in their local environment.

## Application Logic

The MiniPay Airdrop application consists of three main operations: refresh, import, and allocation retrieval. Here's how each of these operations works:

### Refresh Operation

1. It queries Dune Analytics for the latest execution of the airdrop query and then tries to fetch the execution from its database (redis).
2. If the execution doesn'exist in the database, it starts a new import process. For an existing execution, it only starts a new import if:
   - The current import is not finished, AND
   - The current import is older than 30 minutes (considered stale)
3. If neither of these conditions are met, it returns a "Service Unavailable" response.
4. The operation also checks and updates airdrop statistics (total recipients, total MENTO allocated, etc.).
5. If a new import is needed, it schedules import tasks using Google Cloud Tasks.

### Import Operation

1. It's triggered by tasks created during the refresh operation.
2. Each task imports a batch of allocation data (default batch size is 30,000 records).
3. The imported data is stored in Redis with keys in the format `allocation:{executionId}:{address}`.
4. The operation keeps track of the number of rows imported and updates the execution status.
5. Once all batches are imported, it marks the import as finished.

### Allocation Retrieval Operation

1. When a request comes in, it first checks for the latest completed execution in Redis.
2. Using the execution ID and the requested address, it retrieves the allocation data from Redis.
3. If no allocation is found for the address, it returns a 404 error.
4. If found, it calculates the final MENTO allocation based on the user's transfers and holdings:
   - MENTO from transfers = min(10% of amount transferred, 100)
   - MENTO from holdings = min(average amount held, 100)
5. The total allocation, along with a breakdown by task (hold and transfer), is returned to the user.

These operations work together to ensure that the airdrop data is regularly updated and efficiently served to users. The use of Redis as a cache helps in quick data retrieval, while the batch import process allows for handling large datasets without overwhelming the system.

### Using Effect

This project utilizes [Effect](https://effect.website/), a TypeScript metaframework that emphasizes type safety and functional programming principles.
Effect offers powerful features like built-in error handling, improved concurrency management, and high composability.
While it comes with a steep learning curve, these benefits can lead to more robust and maintainable code.

The choice to use Effect in a one-off project might seem unconventional, but it presents a valuable learning opportunity.
Despite the short-term nature of this project, it serves as a chance to gain hands-on experience with advanced functional programming concepts.
Effect's approach to building scalable TypeScript applications provides insights that could inform future technology choices.
While Effect might not be suitable for all projects, especially those with tight deadlines or diverse maintenance teams,
the learning experience and potential code quality improvements make it worthwhile for this particular use case.

#### Recommende Resources

- [Effect Docs](https://effect.website/docs/introduction)
- [Beginner Workshop](https://www.youtube.com/watch?v=Lz2J1NBnHK4&t=8295s&pp=ygUYZWZmZWN0IGJlZ2lubmVyIHdvcmtzaG9w)
- [Advanced Workshop](https://www.youtube.com/watch?v=7jOD5okJC00&t=1910s&pp=ygUYZWZmZWN0IGJlZ2lubmVyIHdvcmtzaG9w)
- [Effect Discord](https://discord.gg/effect-ts)

## Infrastructure

The MiniPay Airdrop project leverages Google Cloud Platform (GCP) for its infrastructure. The infrastructure is provisioned using Terraform scripts located in the `infra/` directory. Below is a detailed overview of the system architecture:

![MiniPay Airdrop Infrastructure Overview](docs/overview.png)

### Core Components

1. **Google Cloud Load Balancer**: Serves as the entry point for client requests, handling traffic distribution and SSL termination.

2. **Cloud Armor**: Sits behind the load balancer, providing security policies and DDoS protection.

3. **Google Cloud Functions**:

   - **External CF**: Hosts the external API for allocation retrieval.
   - **Internal Refresh CF**: Handles the refresh process, checking for updates from Dune Analytics.
   - **Internal Import CF**: Manages the import process, fetching and storing data.

4. **Redis**: Used for caching and storing allocation data.

5. **Cloud Tasks**: Manages the queue for import tasks, triggered by the Internal Refresh CF.

6. **Cloud Scheduler**: Triggers the Internal Refresh CF periodically to check for updates.

### External Services

- **Dune Analytics**: External data source for airdrop allocations.

### Key Interactions

1. Clients interact with the system through the Cloud Load Balancer via HTTPS.
2. Cloud Armor protects against attacks before requests reach the External CF.
3. The External CF retrieves allocation data from Redis to serve client requests.
4. Cloud Scheduler periodically triggers the Internal Refresh CF.
5. The Internal Refresh CF checks Dune Analytics for updates and creates import tasks in Cloud Tasks if necessary.
6. Cloud Tasks triggers the Internal Import CF to process these tasks.
7. The Internal Import CF fetches data from Dune Analytics and stores it in Redis.

### Terraform Modules

1. **build**: Handles the local build process, creating a zip package for deployment.
2. **cloud-function**: A reusable module for deploying Cloud Functions.
3. **lb-http**: Sets up the HTTP(S) load balancer.
4. **security_policy**: Configures Cloud Armor security policies.

This architecture ensures scalability, security, and efficient data processing for the MiniPay Airdrop system. The use of managed GCP services minimizes operational overhead while providing robust performance and reliability.

### Redis Usage and Key Expiry

This project utilizes Redis as a caching layer to store and retrieve allocation data efficiently. The Redis implementation includes a key expiry mechanism to manage data freshness and storage optimization. Here's how the system is designed to work:

1. Data Storage: When allocation data is imported from Dune Analytics, it is stored in Redis with keys in the format `allocation:{executionId}:{address}`.

2. Key Expiry: Each allocation key is set with an expiration time of 3 days (259,200 seconds). This is implemented in the `saveAllocations` function:

```typescript
r.SET(
  `allocation:${executionId}:${allocation.address}`,
  JSON.stringify(allocation),
  {
    EX: 60 * 60 * 24 * 3,
  },
);
```

3. Data Refresh: The system is designed to refresh the data periodically. When new data is imported, it creates new keys with the latest `executionId`, effectively replacing the old data.

4. Automatic Cleanup: As keys expire, Redis automatically removes them, freeing up space without manual intervention.

5. Execution Tracking: The system also keeps track of executions using keys like `execution:{executionId}` and an index `index:execution`. These keys do not have an expiry set, allowing for historical tracking of executions.

6. Eviction Policy: The Redis instance is configured with the `volatile-ttl` eviction policy. This means that when the memory limit is reached, Redis will remove keys with the nearest expiration time. This policy ensures that if the system experiences unexpected high load or delays in data refresh, it will prioritize removing the keys that are closest to expiring anyway.

This approach ensures that the system always serves the most recent data while automatically managing storage by removing outdated information. It provides a balance between data freshness and efficient use of Redis storage, with the eviction policy adding an extra layer of protection against memory exhaustion.

### Connecting to the production Redis

You can connct to the production database by connecting the the cloud network and portforwarding the Redis instance locally and connecting to it with `redis-cli`.

```bash
   gcloud compute ssh port-forward-temporary --zone=us-central1-a -- -N -L <local-port>:<redis-ip>:6379
```

You must replace:

- `<local-port>` with the port you want locally, that can still be `6379` if you're not running a local redis instance
- `<redis-ip>` can be found in google cloud by inspecting the Redis instance

> `port-forward-temporary` is a small compute instance that's required to allow port forwarding, I named it temporary but it will probably stick around.

## Deployment

This section describes how to deploy the MiniPay Airdrop infrastructure using Terraform while impersonating a Google Cloud service account. This method allows for secure, local deployments without the need for long-lived credential files.

### Prerequisites

1. [Terraform](https://www.terraform.io/downloads.html) (version 1.9.2 or later)
2. [Google Cloud SDK](https://cloud.google.com/sdk/docs/install)
3. Access to the Google Cloud project `mento-prod` with the necessary APIs enabled

### Setup

1. Ensure you're logged into the Google Cloud SDK:

```bash
   gcloud auth login
```

2. Set your active project:

```bash
   gcloud config set project mento-prod
```

### Deployment Steps

1. Navigate to the `infra/` directory:

```bash
   cd infra
```

2. Initialize Terraform:

```bash
   terraform init
```

3. Impersonate the service account:

```bash
   gcloud auth application-default login --impersonate-service-account=terraform@mento-prod.iam.gserviceaccount.com
```

4. Plan the Terraform deployment:

```bash
   terraform plan -out=tfplan
```

5. Review the plan carefully to ensure it matches your expectations.

6. Apply the Terraform plan:

```bash
   terraform apply tfplan
```

7. Once the deployment is complete, Terraform will output important information such as function URLs and other resource identifiers.

By following these steps, you can securely deploy the MiniPay Airdrop infrastructure using Terraform while impersonating the designated Google Cloud service account. This method provides a balance between security and ease of use for local deployments.
