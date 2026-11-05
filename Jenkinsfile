pipeline {
    agent any

    environment {
        IMAGE_NAME = "student-attendance-app"
        IMAGE_TAG  = "latest"
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
                    echo "Installing Google Chrome for Selenium..."
                    apt-get update && apt-get install -y wget curl gnupg
                    wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg
                    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list
                    apt-get update && apt-get install -y google-chrome-stable
                    google-chrome --version
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