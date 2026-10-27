# Vidbox

**Vidbox** is a video-on-demand storefront for independent films. Viewers can discover films, purchase them once, and watch films in their personal library. The project demonstrates a complete application workflow across a React client, an Express API, MongoDB, payment processing, and private video storage.

## Project submission details

Fill in the remaining links and your name before submitting:

- **Student name:** Add your name
- **GitHub repository:** [https://github.com/ranjit-05/vidbox](https://github.com/ranjit-05/vidbox)
- **Deployed application:** [https://vidbox-delta.vercel.app](https://vidbox-delta.vercel.app)
- **Demo video:** [https://drive.google.com/file/d/1Cs-wjIj94TnK6t8D15oisrgqP7NPI3e7/view?usp=drive_link)

## Problem and target users

Independent films can be difficult to discover in large streaming catalogs, while rental experiences may not give viewers a lasting personal collection. Vidbox is designed for viewers who want a curated set of independent stories and small distributors who want a simple way to offer a catalog online.

## What users can do

- Browse a curated film catalog; search by title, description, or genre; filter by genre; and sort by featured status, newest, or price.
- Open film details without signing in.
- Create an account or sign in. Passwords are hashed with bcrypt, and authenticated API requests use signed JWTs.
- Buy films with a local demo checkout or Razorpay Standard Checkout.
- View purchased films in a private library.
- Request playback for a film they own. The API returns a short-lived presigned URL for the private S3 video.

## Main workflow

1. A visitor browses the film collection and opens a film’s public details page.
2. The viewer creates an account or signs in before purchasing.
3. The API looks up the film and sets the amount from the database, then creates a pending order.
4. In demo mode, the local demo completion route marks the order paid. In Razorpay mode, the server creates a Razorpay order and the browser opens Razorpay Checkout.
5. The server verifies the Razorpay payment signature and checks the payment status. A signed Razorpay webhook can also update the order.
6. Only a confirmed paid order adds the film ID to the user’s purchased collection.
7. On playback, the API checks the signed-in user’s ownership before returning a five-minute S3 presigned URL. Local demo mode can use the sample video URL when S3 is not configured.

## Architecture

```text
React + Vite browser app
        │ JSON API + bearer token
        ▼
Express + Node.js ─── Razorpay Orders API + signed webhooks
        │                         │
        ▼                         ▼
MongoDB                 Paid order unlocks a film
        │                         │
        └──────── ownership check ┘
                    │
                    ▼
          Private S3 video object
          returned through a short-lived URL
```

### Technology stack

- **Frontend:** React, React Router, Vite, Lucide icons
- **Backend:** Node.js, Express, Mongoose, bcrypt, JWT
- **Database:** MongoDB
- **Payments:** Razorpay Orders API and Standard Checkout; local demo mode is also available
- **Video storage:** AWS S3 presigned URLs (optional for local demo; required for protected S3 playback)

### Database collections

- **User:** normalized unique email, bcrypt password hash, and purchased media IDs.
- **Media:** title, description, genre, year, duration, price, and private S3 object key.
- **Order:** user ID, media ID, amount, payment provider, gateway order/payment IDs, and `pending`, `paid`, or `failed` status.

## Requirements

- Node.js 20 or newer and npm
- MongoDB Community Server running on the local machine, or a MongoDB Atlas connection string
- Optional: Razorpay account for test checkout
- Optional: AWS account and video files you have permission to distribute for private S3 playback

## Run locally on Windows

Open PowerShell in the project folder:

```powershell
Set-Location "C:\Users\ranji\OneDrive\Desktop\New folder"
```

### 1. Start MongoDB

If MongoDB was installed as a Windows service, check its status:

```powershell
Get-Service MongoDB
```

If its status is `Stopped`, start it:

```powershell
Start-Service MongoDB
```

Alternatively, if `mongod.exe` is available on your PATH and you want to run MongoDB manually, use a separate PowerShell window and keep it open:

```powershell
New-Item -ItemType Directory -Force .local/mongo-data
mongod.exe --dbpath .local/mongo-data --bind_ip 127.0.0.1 --port 27017
```

### 2. Configure environment files

For a fresh checkout, copy the examples:

```powershell
Copy-Item server/.env.example server/.env
Copy-Item client/.env.example client/.env
```

Generate a private JWT secret locally:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Copy the generated value into `JWT_SECRET` in `server/.env`. Keep `.env` files private and out of Git. For the existing local installation, retain its current MongoDB database name if you want to keep its existing users and purchases.

The server example defaults to local MongoDB, `PAYMENT_MODE=demo`, and the sample video URL. The client example points to the local API at `http://localhost:4000/api`.

### 3. Install and start the application

From the project folder, install dependencies and start both the API and frontend:

```powershell
npm install
npm run dev
```

Leave this PowerShell window open while using the app. Open [http://localhost:5173](http://localhost:5173). The API health check is [http://localhost:4000/api/health](http://localhost:4000/api/health); a healthy local API returns `status: ok` and the selected payment mode.

The server seeds the six sample catalog records when the media collection is empty. The catalog metadata and S3 object keys are illustrative; video files are not included in this repository.

### 4. Try the local demo

1. Create an account or sign in.
2. Open a film’s details and choose **Get the film**.
3. In demo mode, the purchase completes locally without contacting Razorpay or charging money.
4. Open **My library** and choose **Watch now**.
5. Until S3 is configured, playback uses `DEMO_VIDEO_URL`. This sample is for development demonstration and does not represent protected media delivery.

To build the frontend for deployment:

```powershell
npm run build
```

## Razorpay test checkout

Use Razorpay **Test Mode** first. Test credentials simulate payment; never place the Key Secret or webhook secret in frontend code or Git.

1. In the Razorpay Dashboard, switch to Test Mode and generate a test Key ID and Key Secret under API Keys.
2. In `server/.env`, set:

   ```env
   PAYMENT_MODE=razorpay
   RAZORPAY_KEY_ID=your_test_key_id
   RAZORPAY_KEY_SECRET=your_test_key_secret
   RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
   ```

3. Restart the API after changing environment variables.
4. For local webhook testing, expose port 4000 through a public HTTPS tunnel. The project’s development instructions use zrok:

   ```powershell
   zrok share public localhost:4000
   ```

   Use the public address printed by the tunnel, followed by `/api/webhooks/razorpay`, as the webhook URL. Razorpay needs to reach a public URL; a plain `localhost` address is not reachable by its servers.

5. In the Razorpay Dashboard’s Webhooks settings, subscribe to `payment.captured`, `payment.failed`, and `order.paid`. Set a webhook secret and put the same secret in `RAZORPAY_WEBHOOK_SECRET`.
6. Test a successful payment, a failed payment, and a dismissed checkout. Confirm that only a verified captured payment adds the film to the library.

See Razorpay’s [Standard Checkout documentation](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/) and [webhook documentation](https://razorpay.com/docs/webhooks/) for current Dashboard and test-payment instructions. Use live keys only if you intend to accept real payments and have completed the account’s activation requirements.

## Private S3 video storage

The S3 bucket should keep **Block all public access** enabled. The server checks the user’s ownership before generating a presigned `GetObject` URL, valid for five minutes. Signed-in administrators can add a film from **Add a film** in the Vidbox header. The form uploads an MP4 directly to S3, derives a suggested title from the filename, detects its duration, generates a unique private object key, and creates the MongoDB catalog entry. Each upload is limited to 1 GB, and the uploader limits catalog video storage to 5 GB total as a demo safeguard.

1. Create a private S3 bucket. Use a region and bucket name that you will configure in the server environment.
2. Configure the bucket’s CORS rules from `infrastructure/s3-cors.json`. It allows `GET`, `HEAD`, and `PUT` from the local and deployed Vidbox origins. Keep `AllowedOrigins` limited to the exact frontend sites you use.
3. Give the server identity only `s3:GetObject` and `s3:PutObject` on `arn:aws:s3:::YOUR_BUCKET/videos/*`. The policy template for the current bucket is `infrastructure/vidbox-render-s3-upload-policy.json`. Do not grant public access, `s3:*`, or bucket-wide listing. For local development, keep AWS credentials in the ignored `server/.env`; for deployment, put them in the server host’s secret settings.
4. Set these server variables and restart the API:

   ```env
   AWS_REGION=ap-southeast-2
   S3_BUCKET=vidbox-media-7987357f
   AWS_ACCESS_KEY_ID=your-access-key
   AWS_SECRET_ACCESS_KEY=your-secret-key
   ADMIN_EMAIL=the-email-of-your-existing-vidbox-account
   ```

5. Sign in with the existing account whose email is in `ADMIN_EMAIL`. Choose **Add a film**, then **Enable uploads for my account** once. This saves the admin permission to that user record.
6. To add a film, choose its MP4, review the suggested title and detected duration, set the price, and select **Upload and add to Vidbox**. Vidbox creates both the private S3 object and its catalog record; you do not need to enter an S3 key or match filenames manually.
7. Purchase the film and start playback. The video object stays private; the player receives only the temporary signed URL after the API confirms ownership.

The seeded sample catalog records are illustrative and have no matching S3 videos. Uploading from **Add a film** creates new catalog records; it does not replace the sample records. The app currently does not verify email ownership, so set `ADMIN_EMAIL` to your existing, already registered account email.

AWS documentation: [Block public access](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html), [presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html), and [S3 CORS](https://docs.aws.amazon.com/AmazonS3/latest/userguide/cors.html).

## Environment variables

Set secrets in `server/.env` locally or in the server host’s secret/environment settings after deployment. Do not commit actual `.env` files.

| Variable | Purpose |
| --- | --- |
| `PORT` | API port locally (defaults to `4000`; deployment hosts may supply this value) |
| `CLIENT_ORIGIN` | Exact frontend origin allowed by API CORS |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Random private secret for signing seven-day session tokens |
| `ADMIN_EMAIL` | Existing Vidbox account email allowed to enable the upload page |
| `PAYMENT_MODE` | `demo` for local simulated checkout or `razorpay` for Razorpay Checkout |
| `RAZORPAY_KEY_ID` | Razorpay Key ID; sent to Checkout when Razorpay mode is enabled |
| `RAZORPAY_KEY_SECRET` | Server-only Razorpay API secret |
| `RAZORPAY_WEBHOOK_SECRET` | Server-only secret used to authenticate Razorpay webhook payloads |
| `AWS_REGION` | S3 bucket region |
| `S3_BUCKET` | Private S3 bucket name; blank uses demo playback instead |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Restricted server-side AWS credentials; never expose these in the frontend |
| `DEMO_VIDEO_URL` | Development sample video URL when S3 is not configured |
| `VITE_API_URL` | Frontend API base URL; local default is `http://localhost:4000/api` |

## Deployment

Deploy the Express API and React static frontend as separate services, and use a managed MongoDB database. Configure the server’s environment variables, set `CLIENT_ORIGIN` to the deployed frontend origin, and set the frontend build variable `VITE_API_URL` to the deployed API URL ending in `/api`. Set the Razorpay webhook to the deployed API URL ending in `/api/webhooks/razorpay`. Update S3 CORS to allow the deployed frontend origin.

One example host pairing is Render for the API and Vercel for the frontend:

1. **API service:** connect the GitHub repository to a Render Web Service. Keep the repository root as the service root, set the build command to `npm install`, and set the start command to `npm start`. Add the server environment variables in the Render dashboard. Do not add the local `.env` file to GitHub.
2. **Frontend site:** connect the repository to Vercel and set the project root directory to `client`. Use `npm run build` as the build command and `dist` as the output directory. Set `VITE_API_URL` to the deployed API base URL, including `/api`.
3. **React Router deep links:** if deploying the Vite single-page app on Vercel, add `client/vercel.json` with this fallback so direct visits to `/film/...` and `/library` load the React app:

   ```json
   {
     "$schema": "https://openapi.vercel.sh/vercel.json",
     "rewrites": [
       {
         "source": "/(.*)",
         "destination": "/index.html"
       }
     ]
   }
   ```

4. **Database access:** use a MongoDB Atlas database user and connection string. Add the API host’s outbound IP ranges to the Atlas IP access list so the API can connect.

After deployment, verify the health check, registration/sign-in, public film details, purchase, library ownership, payment failure handling, and video playback. Open an individual film URL directly to confirm client-side routes work after refresh. Never deploy with development secrets or expose a server secret in frontend settings.

## Git and secret handling

The repository’s `.gitignore` excludes `.env` files, `node_modules`, build output, and local MongoDB data. Before pushing, check `git status` and confirm that `server/.env` is not staged. Commit source and documentation changes with clear messages. Keep API secrets, JWT secrets, webhook secrets, and AWS credentials in local environment files or the deployment host’s secret settings.

## Verification status

- **Verified locally:** frontend production build; account sign-in; demo purchase; film appearing in the user’s library; sample video playback.
- **Verified in the deployed app:** Razorpay test-mode success and failure checkouts; webhook deliveries; private S3 upload and playback; and the purchased film appearing in the user’s library.
- **Still required for submission:** add the student name and demo-video link above; record the demo video; verify the app, repository, and video links in a private browser window; and complete the official submission form.
