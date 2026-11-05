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
                    echo "Setting up portable Chrome for CI..."
                    npx @puppeteer/browsers install chrome@stable chromedriver@stable
                    export CHROME_PATH=$(find $HOME/.cache/puppeteer/chrome -name "chrome" -type f | head -n 1)
                    export CHROMEDRIVER_DIR=$(dirname $(find $HOME/.cache/puppeteer/chromedriver -name "chromedriver" -type f | head -n 1))
                    export PATH=$PATH:$CHROMEDRIVER_DIR
                    echo "Portable Chrome binary located at: $CHROME_PATH"
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