import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient, HttpClientModule, HttpHeaders } from '@angular/common/http';
import { Subject, takeUntil } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { Console } from 'console';
import { NgIf } from '@angular/common';

interface UserDTO {
  id?: string;
  userName?: string;
  email?: string;
  phoneNumber?: string;
  address?: string;
  dateOfBirth?: string;
  // Các thuộc tính khác
}
@Component({
selector: 'user-infor',
  standalone: true,
  imports: [FormsModule ,HttpClientModule, NgIf],
  templateUrl: './user-profile.component.html',
  styleUrls: ['./user-profile.component.scss'],
})
export class UserProfileComponent implements OnInit, OnDestroy {
    user: UserDTO = {};
    email: string | null = null;
    userId: string | null = null;
    isEditing!: false;
    
    
    constructor(private http: HttpClient) {}
    
    async ngOnInit(): Promise<void> {
        await this.getUserMailFromToken();
        if (this.userId) {
          this.fetchUserDataAsync();
        } else {
          console.error('Không thể lấy userId, không gọi fetchUserDataAsync.');
          // Xử lý trường hợp không có userId
        }
      }
    
    getToken(): string | null {
        return localStorage.getItem('accessToken');
      }

      async getUserMailFromToken() {
        const token = this.getToken();
        if (token) {
          try {
            const payloadBase64 = token.split('.')[1];
            const payloadJson = atob(payloadBase64);
            const payload = JSON.parse(payloadJson);
            this.email = payload.sub;
    
            if (this.email) {
              this.userId = await this.getUserId(this.email);
              console.log('User ID:', this.userId); // Log userId to console
            } else {
              console.error('Email không được tìm thấy trong token.');
              return null;
            }
            return this.email; // Return email instead of payload.sub
          } catch (error) {
            console.error('Lỗi giải mã token:', error);
            return null;
          }
        }
        return null;
      }

     async getUserId(email: string) {
        const token = this.getToken();
        const headers = new HttpHeaders({
          Authorization: `Bearer ${token}`,
        });
    
        try {
          const response = await this.http
            .get<any>(`http://localhost:8989/api/v1/users/find-by-email/${email}`, {
              headers,
            })
            .toPromise();
          return response.data.id;
        } catch (error) {
          console.error('Lỗi khi lấy userId:', error);
          return null;
        }
      }

    async fetchUserDataAsync(): Promise<void> { 
        const token = this.getToken();
        const userId = await this.getUserId(this.email!);
        console.log('User ID 2:', userId); // Log userId to console
        const headers = new HttpHeaders({
          Authorization: `Bearer ${token}`,
        });
        try {
          const response = await this.http.get<any>(`http://localhost:8989/api/v1/users/${userId}`, {
            headers,})
            .toPromise();
        console.log('Response:', response); // Log response to console
      if (response?.data) { 
        this.user = { ...response.data };
      } else {
        console.error('Không tìm thấy thông tin người dùng hoặc dữ liệu trả về không hợp lệ.');
        // Xử lý trường hợp không có dữ liệu (ví dụ: hiển thị thông báo lỗi cho người dùng)
      }
        } catch (error) {
          console.error('Lỗi khi tải thông tin người dùng:', error);
        }
      }
    
    
    ngOnDestroy(): void {
      
    }
}
