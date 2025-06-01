import { Component } from '@angular/core';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    FormsModule,
    HttpClientModule,
    CommonModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  email = '';
  password = '';
  errorMessage = '';

  constructor(private http: HttpClient,
             private router: Router) {}

login() {
  this.errorMessage = '';

  const loginData = {
    email: this.email,
    passWord: this.password,
  };

  this.http
    .post<any>('http://localhost:8989/api/v1/users/login', loginData)
    .subscribe(
      (response) => {
        if (response.success) {
          localStorage.setItem('accessToken', response.data.accessToken);
          localStorage.setItem('refreshToken', response.data.refreshToken);
          this.router.navigate(['/chat']);
        } else {
          this.errorMessage = 'Đăng nhập thất bại. Vui lòng kiểm tra lại email và mật khẩu.';
        }
      },
      (error) => {
        console.error('Lỗi đăng nhập:', error);

        // Xử lý các lỗi trả về từ backend
        if (error.error && typeof error.error === 'string' && error.error.includes('invalid information')) {
          this.errorMessage = 'Email hoặc mật khẩu không chính xác.';
        } else if (error.error && error.error.message) {
          this.errorMessage = error.error.message;
        } else if (error.status === 0) {
          this.errorMessage = 'Không thể kết nối đến máy chủ. Vui lòng thử lại sau.';
        } else {
          this.errorMessage = 'Đã xảy ra lỗi không xác định. Vui lòng thử lại.';
        }
      }
    );
}

  goToRegister() {
    this.router.navigate(['/register']);
  }
}
