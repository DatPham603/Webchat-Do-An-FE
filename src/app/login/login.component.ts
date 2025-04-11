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
          // Đăng nhập thành công
          if (response.success) {
            // Lưu trữ token và các thông tin khác (nếu cần)
            localStorage.setItem('accessToken', response.data.accessToken);
            localStorage.setItem('refreshToken', response.data.refreshToken);
            // Điều hướng đến trang chính
            this.router.navigate(['/chat']); // Thay đổi '/home' thành đường dẫn trang chính của bạn
          } else {
            this.errorMessage =
              'Đăng nhập thất bại. Vui lòng kiểm tra lại email và mật khẩu.';
          }
        },
        (error) => {
          // Xử lý lỗi API
          this.errorMessage = 'Lỗi kết nối. Vui lòng thử lại sau.';
          console.error('Lỗi đăng nhập:', error);
        }
      );
  }
}
