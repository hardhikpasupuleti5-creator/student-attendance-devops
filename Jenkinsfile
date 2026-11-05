pipeline {
    agent any

    environment {
        IMAGE_NAME = "student-attendance-app"
        IMAGE_TAG  = "latest"
        BROWSER_CACHE = "${WORKSPACE}/.browser-cache"
    }

    stages {
        stage('Checkout Source Code') {
            steps {
                checkout scm
            }
        }

        stage('Install Dependencies') {
            steps {
                sh 'npm install'
            }
        }

        stage('Run Automated Selenium Tests') {
            steps {
                sh '''
                    set -e

                    echo "Setting up Chrome and ChromeDriver..."

                    mkdir -p "$BROWSER_CACHE"

                    npx @puppeteer/browsers install chrome@stable --path "$BROWSER_CACHE"

                    npx @puppeteer/browsers install chromedriver@stable --path "$BROWSER_CACHE"

                    CHROME_PATH=$(find "$BROWSER_CACHE" -type f -path '*/chrome-linux64/chrome' -print -quit)

                    CHROMEDRIVER_PATH=$(find "$BROWSER_CACHE" -type f -path '*/chromedriver-linux64/chromedriver' -print -quit)

                    if [ -z "$CHROME_PATH" ] || [ ! -x "$CHROME_PATH" ]; then
                        echo "ERROR: Chrome binary not found!"
                        exit 1
                    fi

                    if [ -z "$CHROMEDRIVER_PATH" ] || [ ! -x "$CHROMEDRIVER_PATH" ]; then
                        echo "ERROR: ChromeDriver binary not found!"
                        exit 1
                    fi

                    export CHROME_PATH
                    export PATH="$(dirname "$CHROMEDRIVER_PATH"):$PATH"

                    echo "Chrome location: $CHROME_PATH"
                    echo "ChromeDriver location: $CHROMEDRIVER_PATH"

                    "$CHROME_PATH" --version
                    "$CHROMEDRIVER_PATH" --version

                    echo "Starting Selenium tests..."

                    npm test
                '''
            }
        }

        stage('Build Docker Image') {
            steps {
                sh 'docker build -t ${IMAGE_NAME}:${IMAGE_TAG} .'
            }
        }

        stage('Deploy to Kubernetes') {
            steps {
                sh 'kubectl apply -f k8s-deployment.yaml'
                sh 'kubectl rollout status deployment/student-attendance-deployment'
            }
        }
    }

    post {
        success {
            echo 'Pipeline succeeded! Student Attendance System deployed and verified.'
        }

        failure {
            echo 'Pipeline failed. Check test or deployment logs.'
        }
    }
}